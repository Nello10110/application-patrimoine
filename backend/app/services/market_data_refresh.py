"""Orchestration d'un rafraîchissement des cours : garde-fou de fréquence pour les
déclenchements manuels, et exécution en tâche de fond avec statut consultable.

Scindé de `market_data_service.py` (audit structurel du 20/08/2026, § 2.I.2) : ce
module ne sait pas *comment* récupérer un prix ou une composition (c'est
`market_data_service.refresh_tickers`, appelé ici via l'attribut du module plutôt
qu'un import direct de la fonction, pour que les tests puissent continuer à le
monkeypatcher sur `market_data_service`), il sait seulement *quand* et *combien de
fois* on a le droit de le faire tourner.

- `verifier_et_enregistrer_rafraichissement_manuel` (LOT 7.5) : délai minimal entre
  deux rafraîchissements déclenchés manuellement depuis le Portefeuille — le
  rafraîchissement planifié (`scheduler_service`) appelle `refresh_tickers`
  directement et n'est pas concerné.
- `demarrer_rafraichissement`/`etat_rafraichissement` (LOT 4B) : `refresh_tickers`
  sur le portefeuille réel de l'utilisateur dépasse largement la minute — un simple
  `threading.Thread` suffit à en faire une tâche de fond pour cette application
  locale mono-utilisateur (pas de file de tâches externe disproportionnée pour un
  unique job occasionnel). Un verrou (`_verrou_etat`) protège le petit état partagé
  (`_etat`) entre le fil de fond et les fils de requête HTTP qui le consultent.
"""

import logging
import threading
from dataclasses import dataclass, replace
from datetime import datetime, timezone
from typing import Callable

from ..database import SessionLocal
from . import market_data_service
from .historique_cache import invalider_historiques_portefeuille

logger = logging.getLogger("patrimoine.market_data")

DELAI_MINIMAL_ENTRE_RAFRAICHISSEMENTS_SECONDES = 60

# Horodatage du dernier rafraîchissement manuel accepté (état mémoire du process,
# suffisant pour une appli locale mono-utilisateur sans persistance nécessaire d'un
# redémarrage à l'autre).
_dernier_rafraichissement_manuel: datetime | None = None


class RafraichissementTropFrequentError(Exception):
    """Levée par `verifier_et_enregistrer_rafraichissement_manuel` quand un
    rafraîchissement manuel est demandé avant l'écoulement du délai minimal."""

    def __init__(self, secondes_restantes: float):
        self.secondes_restantes = secondes_restantes
        super().__init__(
            f"Merci de patienter encore {secondes_restantes:.0f} seconde(s) avant un nouveau rafraîchissement manuel."
        )


def verifier_et_enregistrer_rafraichissement_manuel() -> None:
    """À appeler en tête de la route de rafraîchissement manuel (LOT 7.5). Lève
    `RafraichissementTropFrequentError` si le délai minimal n'est pas écoulé depuis
    le précédent rafraîchissement manuel accepté ; sinon enregistre celui-ci comme
    référence pour le prochain appel."""
    global _dernier_rafraichissement_manuel
    maintenant = datetime.now(timezone.utc)
    if _dernier_rafraichissement_manuel is not None:
        ecoule = (maintenant - _dernier_rafraichissement_manuel).total_seconds()
        if ecoule < DELAI_MINIMAL_ENTRE_RAFRAICHISSEMENTS_SECONDES:
            raise RafraichissementTropFrequentError(DELAI_MINIMAL_ENTRE_RAFRAICHISSEMENTS_SECONDES - ecoule)
    _dernier_rafraichissement_manuel = maintenant


# ---------------------------------------------------------------------------
# LOT 4B — rafraîchissement en tâche de fond, avec statut consultable
# ---------------------------------------------------------------------------
#
# `POST /api/market-data/refresh` et `POST /api/settings/jobs/{job_key}/run-now`
# exécutaient jusqu'ici `refresh_tickers` de façon synchrone : sur le portefeuille
# réel de l'utilisateur (plusieurs dizaines de positions, plusieurs appels Yahoo
# Finance chacune, temporisées de `DELAI_ENTRE_APPELS_SECONDES` entre elles), la
# requête HTTP dépasse largement la minute — le worker FastAPI reste bloqué tout ce
# temps et le navigateur peut abandonner la requête avant la réponse.
#
# Un simple `threading.Thread` suffit à en faire une tâche de fond : cette
# application est locale, mono-utilisateur, sans plusieurs rafraîchissements
# concurrents à orchestrer ni de worker séparé du process API — une file de tâches
# externe (Celery, RQ, arq...) serait une infrastructure disproportionnée pour un
# unique job occasionnel. Un verrou (`_verrou_etat`) protège le petit état partagé
# (`_etat`) entre le fil de fond et les fils de requête HTTP qui le consultent.


class RafraichissementDejaEnCoursError(Exception):
    """Levée par `demarrer_rafraichissement` quand un rafraîchissement est déjà en
    cours d'exécution (déclenché depuis un autre écran ou un appel précédent)."""

    def __init__(self):
        super().__init__("Un rafraîchissement des cours est déjà en cours.")


@dataclass
class EtatRafraichissement:
    """État courant du rafraîchissement en tâche de fond, tel que consultable via
    `etat_rafraichissement()`/`GET /api/market-data/refresh/status`.

    `statut` vaut `None` tant qu'aucun rafraîchissement n'a jamais abouti ou échoué
    (y compris pendant qu'un premier rafraîchissement est en cours), puis `"ok"` ou
    `"erreur"` selon l'issue du dernier rafraîchissement terminé."""

    en_cours: bool = False
    positions_traitees: int = 0
    positions_total: int = 0
    demarre_le: datetime | None = None
    termine_le: datetime | None = None
    statut: str | None = None  # "ok" | "erreur" | None
    message: str | None = None


_verrou_etat = threading.Lock()
_etat = EtatRafraichissement()

# Référence vers le fil en cours (ou le dernier lancé), exposée pour permettre aux
# tests de l'attendre explicitement (`_thread_courant.join(timeout=...)`) plutôt que
# de sonder l'API à intervalles réels — cf. `tests/test_market_data_background.py`.
_thread_courant: threading.Thread | None = None


def etat_rafraichissement() -> EtatRafraichissement:
    """Copie de l'état courant, sûre à lire depuis un autre fil que celui qui
    l'écrit (le fil de fond du rafraîchissement)."""
    with _verrou_etat:
        return replace(_etat)


def _executer_rafraichissement(
    items: list[tuple[str, str | None]],
    on_termine: Callable[[EtatRafraichissement], None] | None,
) -> None:
    """Corps du fil de fond. Ouvre sa propre session SQLAlchemy : celle de la
    requête HTTP qui a déclenché ce rafraîchissement est refermée dès la réponse
    `202` renvoyée, bien avant que ce travail ne soit terminé. Toute exception est
    capturée et journalisée ici — elle ne doit jamais remonter et faire mourir le
    fil silencieusement sans que l'état ne le reflète."""
    db = SessionLocal()
    total = len(items)
    try:
        def _sur_progression(traitees: int, total_: int) -> None:
            with _verrou_etat:
                _etat.positions_traitees = traitees
                _etat.positions_total = total_

        market_data_service.refresh_tickers(db, items, on_progression=_sur_progression)

        # Le cache d'historique du portefeuille (LOT 4.5) est valable 24h : sans
        # cette invalidation, le graphique d'évolution du tableau de bord resterait
        # figé jusqu'à 24h après une mise à jour des cours, en contradiction avec la
        # valeur (calculée à partir des cours frais) affichée juste à côté. Ce
        # rafraîchissement est global (tous les tickers de tous les utilisateurs,
        # Milestone 2a) : l'invalidation l'est aussi, pour tout le monde d'un coup.
        invalider_historiques_portefeuille(db)

        with _verrou_etat:
            _etat.statut = "ok"
            _etat.message = f"{total} position(s) rafraîchie(s)"
    except Exception as exc:  # jamais laisser une exception tuer le fil en silence
        logger.exception("échec du rafraîchissement des cours en tâche de fond")
        with _verrou_etat:
            _etat.statut = "erreur"
            _etat.message = str(exc)
    finally:
        db.close()
        with _verrou_etat:
            _etat.en_cours = False
            _etat.termine_le = datetime.now(timezone.utc)
            etat_final = replace(_etat)

    if on_termine is not None:
        try:
            on_termine(etat_final)
        except Exception:
            logger.exception("échec du callback de fin de rafraîchissement")


def demarrer_rafraichissement(
    items: list[tuple[str, str | None]],
    on_termine: Callable[[EtatRafraichissement], None] | None = None,
) -> EtatRafraichissement:
    """Lance `market_data_service.refresh_tickers(items)` dans un fil dédié et rend
    la main immédiatement — voir la section ci-dessus pour le pourquoi.

    Lève `RafraichissementDejaEnCoursError` si un rafraîchissement est déjà en
    cours ; sinon renvoie l'état de démarrage (pratique pour l'afficher tout de
    suite côté frontend sans attendre le premier sondage de
    `GET /api/market-data/refresh/status`).

    `on_termine`, optionnel, est appelé (dans le fil de fond, une fois l'état
    final déterminé) avec une copie de cet état final. Utilisé par
    `scheduler_service.run_job_now` (LOT 4B) pour répercuter le résultat dans
    `ScheduledJobConfig`, consulté par la page Réglages."""
    global _thread_courant
    with _verrou_etat:
        if _etat.en_cours:
            raise RafraichissementDejaEnCoursError()
        _etat.en_cours = True
        _etat.positions_traitees = 0
        _etat.positions_total = len(items)
        _etat.demarre_le = datetime.now(timezone.utc)
        _etat.termine_le = None
        _etat.statut = None
        _etat.message = None
        etat_depart = replace(_etat)

    thread = threading.Thread(
        target=_executer_rafraichissement, args=(items, on_termine), daemon=True, name="rafraichissement-cours"
    )
    _thread_courant = thread
    thread.start()
    return etat_depart
