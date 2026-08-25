"""Calculateur brut/net et taux d'épargne du foyer — deux besoins volontairement tenus
séparés du reste de l'application :

1. Conversion brut <-> net **approximative et assumée comme telle**. Il n'existe pas d'API
   gratuite fiable pour un vrai calcul de paie (cotisations exactes selon convention
   collective, tranches, cas particuliers) : on utilise un coefficient net/brut forfaitaire
   selon le statut (cadre/non-cadre), comme les calculatrices brut-net grand public — jamais
   présenté comme un bulletin de paie certifié.

2. Taux d'épargne = argent RÉELLEMENT investi (achats de titres réels sur l'année,
   `performance_service.montant_investi_periode`) rapporté au revenu net de l'année — une
   mesure de comportement d'épargne, à ne jamais confondre avec le rendement du portefeuille
   (`performance_service.compute_performance`, qui mesure la performance de marché sur ce qui
   est déjà investi). Les deux métriques ne se recoupent jamais dans ce module.
"""

from sqlalchemy.orm import Session

from ..models import Salaire
from . import performance_service, preferences_service

EPSILON = 1e-6

# Coefficient approximatif net/brut (cotisations salariales secteur privé, hors cas
# particuliers) — cadre : ~25 % de charges salariales (dont AGIRC-ARRCO tranche cadre et
# prévoyance obligatoire) ; non-cadre : ~22 %. Volontairement forfaitaire, cf. docstring
# de module.
COEFFICIENT_NET_SUR_BRUT = {"cadre": 0.75, "non_cadre": 0.78}

STATUTS_VALIDES = tuple(COEFFICIENT_NET_SUR_BRUT.keys())
TYPES_MONTANT_VALIDES = ("brut", "net")
PERIODICITES_VALIDES = ("mensuel", "annuel")


def estimer_brut_net(montant: float, type_montant: str, statut: str) -> tuple[float, float]:
    """(brut, net_avant_impot) estimés à partir d'une saisie brut OU net, sur la même base
    temporelle que `montant` (l'appelant annualise avant ou après selon son besoin)."""
    coefficient = COEFFICIENT_NET_SUR_BRUT[statut]
    if type_montant == "brut":
        return montant, montant * coefficient
    return montant / coefficient, montant


def compute_salaire_resume(
    db: Session,
    user_id: int,
    annee: int,
    *,
    montant: float,
    type_montant: str,
    periodicite: str,
    statut: str,
    nombre_mois: int,
) -> dict:
    """Résumé complet pour une année donnée : brut/net avant-après impôt (annuel, moyenne
    mensuelle sur 12 mois, et par versement réel sur `nombre_mois`), et le taux d'épargne
    de l'année. Ne persiste rien — la persistance est à la charge de l'appelant
    (`routers/salaire.py`)."""
    brut, net_avant_impot = estimer_brut_net(montant, type_montant, statut)
    if periodicite == "mensuel":
        brut_annuel = brut * nombre_mois
        net_avant_impot_annuel = net_avant_impot * nombre_mois
    else:
        brut_annuel = brut
        net_avant_impot_annuel = net_avant_impot

    taux_imposition_pct = preferences_service.lire_taux_imposition_pct(db, user_id)
    if taux_imposition_pct is not None:
        net_apres_impot_annuel = net_avant_impot_annuel * (1 - taux_imposition_pct / 100)
    else:
        net_apres_impot_annuel = None

    montant_investi_annee = performance_service.montant_investi_periode(db, user_id, f"{annee}-01-01", f"{annee}-12-31")

    base_epargne_apres_impot = net_apres_impot_annuel is not None
    base_epargne = net_apres_impot_annuel if base_epargne_apres_impot else net_avant_impot_annuel
    taux_epargne_pct = (montant_investi_annee / base_epargne * 100) if base_epargne > EPSILON else None

    return {
        "annee": annee,
        "montant": montant,
        "type_montant": type_montant,
        "periodicite": periodicite,
        "statut": statut,
        "nombre_mois": nombre_mois,
        "brut_annuel": round(brut_annuel, 2),
        "brut_mensuel_moyen": round(brut_annuel / 12, 2),
        "brut_par_versement": round(brut_annuel / nombre_mois, 2),
        "net_avant_impot_annuel": round(net_avant_impot_annuel, 2),
        "net_avant_impot_mensuel_moyen": round(net_avant_impot_annuel / 12, 2),
        "net_avant_impot_par_versement": round(net_avant_impot_annuel / nombre_mois, 2),
        "net_apres_impot_annuel": round(net_apres_impot_annuel, 2) if net_apres_impot_annuel is not None else None,
        "net_apres_impot_mensuel_moyen": round(net_apres_impot_annuel / 12, 2) if net_apres_impot_annuel is not None else None,
        "montant_investi_annee": round(montant_investi_annee, 2),
        "taux_epargne_pct": round(taux_epargne_pct, 2) if taux_epargne_pct is not None else None,
        "taux_epargne_base_net_apres_impot": base_epargne_apres_impot,
    }


def list_salaires(db: Session, user_id: int) -> list[Salaire]:
    return db.query(Salaire).filter(Salaire.user_id == user_id).order_by(Salaire.annee.asc()).all()


def get_salaire(db: Session, user_id: int, annee: int) -> Salaire | None:
    return db.query(Salaire).filter(Salaire.user_id == user_id, Salaire.annee == annee).first()


def upsert_salaire(
    db: Session,
    user_id: int,
    annee: int,
    *,
    montant: float,
    type_montant: str,
    periodicite: str,
    statut: str,
    nombre_mois: int,
) -> Salaire:
    ligne = get_salaire(db, user_id, annee)
    if ligne is None:
        ligne = Salaire(user_id=user_id, annee=annee)
        db.add(ligne)
    ligne.montant = montant
    ligne.type_montant = type_montant
    ligne.periodicite = periodicite
    ligne.statut = statut
    ligne.nombre_mois = nombre_mois
    db.commit()
    db.refresh(ligne)
    return ligne


def delete_salaire(db: Session, user_id: int, annee: int) -> bool:
    ligne = get_salaire(db, user_id, annee)
    if ligne is None:
        return False
    db.delete(ligne)
    db.commit()
    return True


def resume_depuis_ligne(db: Session, ligne: Salaire) -> dict:
    return compute_salaire_resume(
        db,
        ligne.user_id,
        ligne.annee,
        montant=ligne.montant,
        type_montant=ligne.type_montant,
        periodicite=ligne.periodicite,
        statut=ligne.statut,
        nombre_mois=ligne.nombre_mois,
    )
