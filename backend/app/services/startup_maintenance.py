"""Remise à niveau du portefeuille reconstruit après une mise à jour de l'application.

Le tableau `holdings` n'est pas recalculé à chaque démarrage : c'est le résultat figé
d'une reconstruction depuis le grand livre (`portfolio_reconstruction.rebuild_holdings`),
déclenchée à l'import de transactions. Conséquence : quand une mise à jour change une
règle de calcul, les lignes déjà en base gardent silencieusement l'ancien résultat
jusqu'au prochain import — l'utilisateur voit des chiffres périmés sans qu'aucune erreur
ne le signale.

Cas réellement rencontré : l'intégration des frais d'entrée d'un investissement en fonds
non coté au coût de revient (ils n'étaient comptés nulle part) ne se voyait qu'après une
reconstruction. Les `prix_revient_moyen` stockés restaient ceux de l'ancienne règle, et
la valeur du portefeuille était sous-évaluée de ces frais.

D'où ce mécanisme : une version des règles de calcul est enregistrée dans `parametres`.
Au démarrage, si la version stockée ne correspond pas à celle du code, le portefeuille
est reconstruit une fois, puis la version est mise à jour. Idempotent (le démarrage
suivant ne fait plus rien), sans effet sur une base neuve, et sans risque pour les
lignes saisies à la main : `rebuild_holdings` les préserve déjà.

**Quand incrémenter `VERSION_CALCUL_PORTEFEUILLE`** : dès qu'une modification change le
résultat de `compute_positions`/`rebuild_holdings` pour un même grand livre — coût de
revient, quantité, gains réalisés. Pas besoin de l'incrémenter pour un changement qui ne
touche que l'affichage ou un calcul refait à chaque requête.
"""

import logging

from sqlalchemy.orm import Session

from ..models import Parametre, Transaction
from . import historique_cache, portfolio_reconstruction

logger = logging.getLogger("outil_bourse.maintenance")

CLE_VERSION_CALCUL = "version_calcul_portefeuille"

# 2 : intégration des frais/taxes d'un CASH/PRIVATE_MARKET_BUY au coût de revient, et
#     arithmétique algébrique des frais (cf. `portfolio_reconstruction`).
VERSION_CALCUL_PORTEFEUILLE = 2


def _version_enregistree(db: Session) -> int | None:
    parametre = db.get(Parametre, CLE_VERSION_CALCUL)
    if parametre is None:
        return None
    try:
        return int(parametre.valeur)
    except (TypeError, ValueError):
        # Valeur illisible (édition manuelle de la base) : on la traite comme absente,
        # ce qui déclenche une reconstruction — inoffensive et remet la valeur au propre.
        return None


def _enregistrer_version(db: Session, version: int) -> None:
    parametre = db.get(Parametre, CLE_VERSION_CALCUL)
    if parametre is None:
        db.add(Parametre(cle=CLE_VERSION_CALCUL, valeur=str(version)))
    else:
        parametre.valeur = str(version)
    db.commit()


def reconstruire_si_regles_de_calcul_modifiees(db: Session) -> int | None:
    """Reconstruit le portefeuille si les règles de calcul ont changé depuis la dernière
    reconstruction. Renvoie le nombre de positions recalculées, ou `None` s'il n'y avait
    rien à faire.

    Une exception n'est jamais laissée remonter : une remise à niveau qui échoue ne doit
    pas empêcher l'application de démarrer — l'utilisateur peut toujours relancer une
    reconstruction depuis l'écran Import.
    """
    try:
        if _version_enregistree(db) == VERSION_CALCUL_PORTEFEUILLE:
            return None

        if db.query(Transaction).first() is None:
            # Base neuve ou portefeuille entièrement saisi à la main : rien à
            # reconstruire, on se contente de poser la version courante.
            _enregistrer_version(db, VERSION_CALCUL_PORTEFEUILLE)
            return None

        resultat = portfolio_reconstruction.rebuild_holdings(db)
        historique_cache.invalider(db)
        _enregistrer_version(db, VERSION_CALCUL_PORTEFEUILLE)
        logger.info(
            "remise à niveau: portefeuille reconstruit (%d position(s)) suite à un changement "
            "des règles de calcul — les prix de revient et gains réalisés sont à jour.",
            resultat.positions_recalculees,
        )
        return resultat.positions_recalculees
    except Exception:
        db.rollback()
        logger.exception(
            "remise à niveau du portefeuille impossible — l'application démarre malgré tout, "
            "relancez une reconstruction depuis l'écran Import."
        )
        return None
