"""Réglages applicatifs persistants (LOT 5B), stockés dans `models.UserParametre`
(table clé/valeur générique, par utilisateur depuis le Milestone 2b — cf.
`docs/BACKLOG.md` § 2.I.1). Ce module est le SEUL point d'accès à cette table :
il expose des accesseurs typés et nommés par réglage plutôt qu'un `get(cle)`
générique — un appelant ne doit jamais avoir à connaître la clé de stockage brute
ni le format texte utilisé pour un booléen/nombre.

Chaque réglage a une valeur par défaut posée ici (constante) : un compte neuf, ou
un compte existant n'ayant jamais touché à ce réglage, se comporte donc comme
avant l'introduction du réglage — c'est ce qui garantit que la méthode de calcul
du coût de revient par défaut (coût moyen pondéré) reste strictement celle déjà en
place, sans qu'une migration de données soit nécessaire.
"""

from sqlalchemy.orm import Session

from ..models import UserParametre

# Clés de stockage en base (`UserParametre.cle`), jamais exposées en dehors de ce module.
_CLE_METHODE_COUT = "methode_cout"
_CLE_SEUIL_ALERTE_ECART_PCT = "seuil_alerte_ecart_pct"
_CLE_BUDGET_CATEGORIES_INITIALISEES = "budget_categories_initialisees"

# Méthode de calcul du coût de revient (LOT 5.6) : coût moyen pondéré (défaut
# historique, comportement inchangé) ou FIFO (premier entré, premier sorti), cf.
# `services/portfolio_reconstruction.py`.
METHODE_COUT_MOYEN_PONDERE = "cout_moyen_pondere"
METHODE_FIFO = "fifo"
METHODES_VALIDES = (METHODE_COUT_MOYEN_PONDERE, METHODE_FIFO)

# Seuil (en points de pourcentage d'écart absolu réel/cible) au-delà duquel une
# recommandation de rééquilibrage devient une ALERTE (cf. LOT 5.5, distinct du
# seuil de 2 points de `services/rebalancing.SEUIL_ECART_PCT` qui décide, lui, si
# une recommandation existe tout court) : une recommandation informe simplement
# d'un écart mesuré, une alerte réclame une action de la part de l'utilisateur.
SEUIL_ALERTE_ECART_PCT_DEFAUT = 5.0


def _lire_valeur_brute(db: Session, cle: str, user_id: int) -> str | None:
    parametre = db.get(UserParametre, (cle, user_id))
    return parametre.valeur if parametre is not None else None


def _ecrire_valeur_brute(db: Session, cle: str, user_id: int, valeur: str) -> None:
    parametre = db.get(UserParametre, (cle, user_id))
    if parametre is None:
        db.add(UserParametre(cle=cle, user_id=user_id, valeur=valeur))
    else:
        parametre.valeur = valeur


def lire_methode_cout(db: Session, user_id: int) -> str:
    """Méthode de calcul du coût de revient actuellement configurée pour ce
    compte. Une valeur en base qui ne serait plus l'une des deux valeurs
    autorisées (ne devrait jamais arriver, `PreferencesUpdate` la contraint en
    amont) retombe sur le défaut plutôt que de propager une donnée invalide dans
    la reconstruction."""
    valeur = _lire_valeur_brute(db, _CLE_METHODE_COUT, user_id)
    return valeur if valeur in METHODES_VALIDES else METHODE_COUT_MOYEN_PONDERE


def lire_seuil_alerte_ecart_pct(db: Session, user_id: int) -> float:
    valeur = _lire_valeur_brute(db, _CLE_SEUIL_ALERTE_ECART_PCT, user_id)
    if valeur is None:
        return SEUIL_ALERTE_ECART_PCT_DEFAUT
    try:
        return float(valeur)
    except ValueError:
        return SEUIL_ALERTE_ECART_PCT_DEFAUT


def budget_categories_initialisees(db: Session, user_id: int) -> bool:
    """Drapeau posé une fois l'arbre de catégories budget créé pour ce foyer
    (backlog 2.N.1, `services/budget_categories_service.py`) — distingue "jamais
    utilisé" (les catégories par défaut doivent être semées) de "tout supprimé
    volontairement" (elles ne doivent plus jamais réapparaître), les deux se
    traduisant sinon par une liste vide indiscernable."""
    return _lire_valeur_brute(db, _CLE_BUDGET_CATEGORIES_INITIALISEES, user_id) is not None


def marquer_budget_categories_initialisees(db: Session, user_id: int) -> None:
    if not budget_categories_initialisees(db, user_id):
        _ecrire_valeur_brute(db, _CLE_BUDGET_CATEGORIES_INITIALISEES, user_id, "1")


def lire_preferences(db: Session, user_id: int) -> dict:
    """Ensemble complet des réglages de ce compte, défauts compris — jamais de clé
    manquante même sur un compte neuf, contrairement à une lecture directe de
    `UserParametre`."""
    return {
        "methode_cout": lire_methode_cout(db, user_id),
        "seuil_alerte_ecart_pct": lire_seuil_alerte_ecart_pct(db, user_id),
    }


def enregistrer_preferences(db: Session, user_id: int, methode_cout: str, seuil_alerte_ecart_pct: float) -> dict:
    """Écrit les deux réglages de ce compte et renvoie l'ensemble des préférences
    relu (même forme que `lire_preferences`). La validation des valeurs (méthode
    autorisée, seuil entre 0 et 100) est déjà faite en amont par
    `schemas.PreferencesUpdate` : ce module ne fait ici que persister, pas que
    revalider."""
    _ecrire_valeur_brute(db, _CLE_METHODE_COUT, user_id, methode_cout)
    _ecrire_valeur_brute(db, _CLE_SEUIL_ALERTE_ECART_PCT, user_id, str(seuil_alerte_ecart_pct))
    db.commit()
    return lire_preferences(db, user_id)
