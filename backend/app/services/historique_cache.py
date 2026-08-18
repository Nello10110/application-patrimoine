"""Cache persistant pour les historiques de prix coûteux à recalculer (cf. LOT 4.4
« historique d'une ligne » et 4.5 « historique du portefeuille »), tous deux
alimentés par `yfinance.history()` — plusieurs secondes d'attente réseau — pour une
donnée qui ne bouge qu'au mieux une fois par jour.

Mécanisme volontairement unique pour les deux besoins : une table `HistoriqueCache`
(clé -> JSON + date de dernière écriture), interrogée par `lire`/écrite par `ecrire`,
avec expiration sur lecture (`DUREE_VALIDITE_HEURES`) plutôt que par purge active —
plus simple, et suffisant pour une appli locale mono-utilisateur. Les clés sont
construites par des fonctions nommées (`cle_historique_ligne`/`cle_historique_portefeuille`)
plutôt que par des chaînes en dur dispersées dans les appelants, pour n'avoir qu'un
seul endroit à faire évoluer si le format de clé change.

Persistant en base (et non en mémoire process) pour survivre aux redémarrages de
l'API en développement, et pour rester cohérent avec `run_startup_migrations` qui
crée déjà toutes les tables au démarrage.
"""

import json
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from ..models import HistoriqueCache

# Durée de validité d'une entrée de cache. Les séries récupérées sont hebdomadaires
# (`interval="1wk"` côté `historical_performance_service`) : un rafraîchissement
# quotidien est donc déjà plus fin que la donnée elle-même, inutile de recalculer
# à chaque ouverture de fiche/tableau de bord dans l'intervalle.
DUREE_VALIDITE_HEURES = 24


def cle_historique_ligne(ticker: str) -> str:
    """Clé de cache de l'historique de prix d'une seule ligne du portefeuille (4.4)."""
    return f"historique_ligne:{ticker}"


def cle_historique_portefeuille() -> str:
    """Clé de cache de l'historique de valeur de tout le portefeuille (4.5)."""
    return "historique_portefeuille"


def lire(db: Session, cle: str):
    """Contenu en cache pour `cle`, ou `None` si absent ou périmé (> `DUREE_VALIDITE_HEURES`).
    Ne supprime pas l'entrée périmée : `ecrire` l'écrasera au prochain calcul."""
    entree = db.get(HistoriqueCache, cle)
    if entree is None:
        return None

    # SQLite ne conserve pas le fuseau horaire des `datetime` stockés : `derniere_maj`
    # revient nue (naïve) mais a toujours été écrite en UTC (cf. `ecrire` ci-dessous et
    # convention déjà en place dans `performance_service`/`historical_performance_service`).
    maintenant = datetime.now(timezone.utc).replace(tzinfo=None)
    if maintenant - entree.derniere_maj > timedelta(hours=DUREE_VALIDITE_HEURES):
        return None

    return json.loads(entree.contenu_json)


def ecrire(db: Session, cle: str, contenu) -> None:
    """Écrit (ou remplace) le contenu en cache pour `cle`. `contenu` doit être
    sérialisable en JSON tel quel (listes/dicts de types simples — c'est déjà le cas
    des résultats produits par `historical_performance_service`, qui convertit les
    dates en chaînes ISO avant de renvoyer son résultat)."""
    contenu_json = json.dumps(contenu)
    maintenant = datetime.now(timezone.utc).replace(tzinfo=None)

    entree = db.get(HistoriqueCache, cle)
    if entree is None:
        db.add(HistoriqueCache(cle=cle, contenu_json=contenu_json, derniere_maj=maintenant))
    else:
        entree.contenu_json = contenu_json
        entree.derniere_maj = maintenant
    db.commit()


def invalider(db: Session, cle: str | None = None) -> None:
    """Purge une entrée (`cle` donnée) ou tout le cache (`cle is None`). Appelée
    depuis `portfolio_reconstruction.rebuild_holdings` : le portefeuille venant de
    changer, tout historique en cache est potentiellement caduc."""
    query = db.query(HistoriqueCache)
    if cle is not None:
        query = query.filter(HistoriqueCache.cle == cle)
    query.delete()
    db.commit()
