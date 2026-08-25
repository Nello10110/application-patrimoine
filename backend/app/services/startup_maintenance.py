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

from ..models import Parametre, Transaction, User
from . import historique_cache, portfolio_reconstruction

logger = logging.getLogger("patrimoine.maintenance")

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
    """Reconstruit le portefeuille de TOUS les utilisateurs si les règles de calcul
    ont changé depuis la dernière reconstruction. Renvoie le nombre total de
    positions recalculées (tous comptes confondus), ou `None` s'il n'y avait rien à
    faire.

    Multi-utilisateur (Milestone 2a/2b, `docs/BACKLOG.md` § 2.I.1) :
    `VERSION_CALCUL_PORTEFEUILLE` reste volontairement une version GLOBALE dans
    `Parametre` (contrairement à `methode_cout`, devenue par utilisateur au
    Milestone 2b dans `UserParametre`) — c'est un marqueur de
    version du CODE de calcul, pas une préférence, il n'a donc pas de sens par
    compte. Un changement de règle de calcul doit reconstruire le portefeuille de
    CHAQUE compte existant : la boucle ci-dessous est le comportement définitif,
    pas un compromis en attendant un futur milestone. Tourne toujours au démarrage
    du process, avec une session unique partagée par tous les comptes (pas de
    `current_user` disponible ici, contrairement aux endpoints HTTP).

    Une exception n'est jamais laissée remonter : une remise à niveau qui échoue ne doit
    pas empêcher l'application de démarrer — l'utilisateur peut toujours relancer une
    reconstruction depuis l'écran Import.
    """
    try:
        if _version_enregistree(db) == VERSION_CALCUL_PORTEFEUILLE:
            return None

        if db.query(Transaction).first() is None:
            # Aucun utilisateur n'a de grand livre importé (base neuve, ou
            # portefeuilles entièrement saisis à la main) : rien à reconstruire, on
            # se contente de poser la version courante.
            _enregistrer_version(db, VERSION_CALCUL_PORTEFEUILLE)
            return None

        total_recalcule = 0
        for (user_id,) in db.query(User.id).all():
            if db.query(Transaction).filter(Transaction.user_id == user_id).first() is None:
                continue  # ce compte n'a pas de grand livre importé, rien à reconstruire pour lui
            resultat = portfolio_reconstruction.rebuild_holdings(db, user_id)
            total_recalcule += resultat.positions_recalculees

        historique_cache.invalider(db)
        _enregistrer_version(db, VERSION_CALCUL_PORTEFEUILLE)
        logger.info(
            "remise à niveau: portefeuille reconstruit (%d position(s), tous comptes confondus) "
            "suite à un changement des règles de calcul — les prix de revient et gains réalisés "
            "sont à jour.",
            total_recalcule,
        )
        return total_recalcule
    except Exception:
        db.rollback()
        logger.exception(
            "remise à niveau du portefeuille impossible — l'application démarre malgré tout, "
            "relancez une reconstruction depuis l'écran Import."
        )
        return None
