"""Réglages applicatifs persistants (LOT 5B), stockés dans `models.Parametre`
(table clé/valeur générique). Ce module est le SEUL point d'accès à cette table :
il expose des accesseurs typés et nommés par réglage plutôt qu'un `get(cle)`
générique — un appelant ne doit jamais avoir à connaître la clé de stockage brute
ni le format texte utilisé pour un booléen/nombre.

Chaque réglage a une valeur par défaut posée ici (constante) : une base neuve, ou
une base existante n'ayant jamais touché à ce réglage, se comporte donc comme
avant l'introduction du réglage — c'est ce qui garantit que la méthode de calcul
du coût de revient par défaut (coût moyen pondéré) reste strictement celle déjà en
place, sans qu'une migration de données soit nécessaire.
"""

from sqlalchemy.orm import Session

from ..models import Parametre

# Clés de stockage en base (`Parametre.cle`), jamais exposées en dehors de ce module.
_CLE_METHODE_COUT = "methode_cout"
_CLE_SEUIL_ALERTE_ECART_PCT = "seuil_alerte_ecart_pct"

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


def _lire_valeur_brute(db: Session, cle: str) -> str | None:
    parametre = db.get(Parametre, cle)
    return parametre.valeur if parametre is not None else None


def _ecrire_valeur_brute(db: Session, cle: str, valeur: str) -> None:
    parametre = db.get(Parametre, cle)
    if parametre is None:
        db.add(Parametre(cle=cle, valeur=valeur))
    else:
        parametre.valeur = valeur


def lire_methode_cout(db: Session) -> str:
    """Méthode de calcul du coût de revient actuellement configurée. Une valeur en
    base qui ne serait plus l'une des deux valeurs autorisées (ne devrait jamais
    arriver, `PreferencesUpdate` la contraint en amont) retombe sur le défaut
    plutôt que de propager une donnée invalide dans la reconstruction."""
    valeur = _lire_valeur_brute(db, _CLE_METHODE_COUT)
    return valeur if valeur in METHODES_VALIDES else METHODE_COUT_MOYEN_PONDERE


def lire_seuil_alerte_ecart_pct(db: Session) -> float:
    valeur = _lire_valeur_brute(db, _CLE_SEUIL_ALERTE_ECART_PCT)
    if valeur is None:
        return SEUIL_ALERTE_ECART_PCT_DEFAUT
    try:
        return float(valeur)
    except ValueError:
        return SEUIL_ALERTE_ECART_PCT_DEFAUT


def lire_preferences(db: Session) -> dict:
    """Ensemble complet des réglages, défauts compris — jamais de clé manquante
    même sur une base neuve, contrairement à une lecture directe de `Parametre`."""
    return {
        "methode_cout": lire_methode_cout(db),
        "seuil_alerte_ecart_pct": lire_seuil_alerte_ecart_pct(db),
    }


def enregistrer_preferences(db: Session, methode_cout: str, seuil_alerte_ecart_pct: float) -> dict:
    """Écrit les deux réglages et renvoie l'ensemble des préférences relu (même
    forme que `lire_preferences`). La validation des valeurs (méthode autorisée,
    seuil entre 0 et 100) est déjà faite en amont par `schemas.PreferencesUpdate` :
    ce module ne fait ici que persister, pas que revalider."""
    _ecrire_valeur_brute(db, _CLE_METHODE_COUT, methode_cout)
    _ecrire_valeur_brute(db, _CLE_SEUIL_ALERTE_ECART_PCT, str(seuil_alerte_ecart_pct))
    db.commit()
    return lire_preferences(db)
