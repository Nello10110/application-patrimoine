"""Calculateur brut/net et taux d'épargne du foyer — deux besoins volontairement tenus
séparés du reste de l'application :

1. Conversion brut <-> net **approximative et assumée comme telle**. Il n'existe pas d'API
   gratuite fiable pour un vrai calcul de paie (cotisations exactes selon convention
   collective, tranches, cas particuliers) : on utilise un coefficient net/brut forfaitaire
   selon le statut (cadre/non-cadre), comme les calculatrices brut-net grand public — jamais
   présenté comme un bulletin de paie certifié.

2. Taux d'épargne = argent RÉELLEMENT investi (achats de titres réels sur l'année,
   `performance_service.montant_investi_periode`) rapporté au revenu net **total** de
   l'année — une mesure de comportement d'épargne, à ne jamais confondre avec le rendement
   du portefeuille (`performance_service.compute_performance`, qui mesure la performance de
   marché sur ce qui est déjà investi). Les deux métriques ne se recoupent jamais dans ce
   module.

Plusieurs entrées de salaire par année sont possibles (ex. un revenu par conjoint), chacune
avec son propre taux d'imposition — pas de préférence globale partagée : le taux d'épargne
du foyer agrège TOUTES les entrées d'une année (`compute_synthese_annee`), jamais une seule
prise isolément.
"""

from sqlalchemy.orm import Session

from ..models import Salaire
from . import performance_service

EPSILON = 1e-6

# Coefficient approximatif net/brut (cotisations salariales secteur privé, hors cas
# particuliers) — cadre : ~25 % de charges salariales (dont AGIRC-ARRCO tranche cadre et
# prévoyance obligatoire) ; non-cadre : ~22 %. Volontairement forfaitaire, cf. docstring
# de module.
COEFFICIENT_NET_SUR_BRUT = {"cadre": 0.75, "non_cadre": 0.78}

STATUTS_VALIDES = tuple(COEFFICIENT_NET_SUR_BRUT.keys())
TYPES_MONTANT_VALIDES = ("brut", "net")
PERIODICITES_VALIDES = ("mensuel", "annuel")
NOM_PAR_DEFAUT = "Salaire"


def estimer_brut_net(montant: float, type_montant: str, statut: str) -> tuple[float, float]:
    """(brut, net_avant_impot) estimés à partir d'une saisie brut OU net, sur la même base
    temporelle que `montant` (l'appelant annualise avant ou après selon son besoin)."""
    coefficient = COEFFICIENT_NET_SUR_BRUT[statut]
    if type_montant == "brut":
        return montant, montant * coefficient
    return montant / coefficient, montant


def compute_resume_entree(
    *,
    montant: float,
    type_montant: str,
    periodicite: str,
    statut: str,
    nombre_mois: int,
    taux_imposition_pct: float | None,
) -> dict:
    """Résumé brut/net d'UNE entrée de salaire — pure fonction, aucun accès base : le taux
    d'imposition est désormais porté par l'entrée elle-même, plus de lecture de préférence
    globale. `net_apres_impot_*` reste `None` tant que `taux_imposition_pct` n'est pas
    renseigné pour cette entrée précise."""
    brut, net_avant_impot = estimer_brut_net(montant, type_montant, statut)
    if periodicite == "mensuel":
        brut_annuel = brut * nombre_mois
        net_avant_impot_annuel = net_avant_impot * nombre_mois
    else:
        brut_annuel = brut
        net_avant_impot_annuel = net_avant_impot

    if taux_imposition_pct is not None:
        net_apres_impot_annuel = net_avant_impot_annuel * (1 - taux_imposition_pct / 100)
    else:
        net_apres_impot_annuel = None

    return {
        "brut_annuel": round(brut_annuel, 2),
        "brut_mensuel_moyen": round(brut_annuel / 12, 2),
        "brut_par_versement": round(brut_annuel / nombre_mois, 2),
        "net_avant_impot_annuel": round(net_avant_impot_annuel, 2),
        "net_avant_impot_mensuel_moyen": round(net_avant_impot_annuel / 12, 2),
        "net_avant_impot_par_versement": round(net_avant_impot_annuel / nombre_mois, 2),
        "net_apres_impot_annuel": round(net_apres_impot_annuel, 2) if net_apres_impot_annuel is not None else None,
        "net_apres_impot_mensuel_moyen": round(net_apres_impot_annuel / 12, 2) if net_apres_impot_annuel is not None else None,
    }


def resume_depuis_ligne(ligne: Salaire) -> dict:
    """`SalaireResume` complet (schéma + résumé calculé) pour une ligne persistée."""
    resume = compute_resume_entree(
        montant=ligne.montant,
        type_montant=ligne.type_montant,
        periodicite=ligne.periodicite,
        statut=ligne.statut,
        nombre_mois=ligne.nombre_mois,
        taux_imposition_pct=ligne.taux_imposition_pct,
    )
    return {
        "id": ligne.id,
        "annee": ligne.annee,
        "nom": ligne.nom or NOM_PAR_DEFAUT,
        "montant": ligne.montant,
        "type_montant": ligne.type_montant,
        "periodicite": ligne.periodicite,
        "statut": ligne.statut,
        "nombre_mois": ligne.nombre_mois,
        "taux_imposition_pct": ligne.taux_imposition_pct,
        **resume,
    }


def compute_synthese_annee(db: Session, user_id: int, annee: int) -> dict:
    """Agrège TOUTES les entrées de salaire d'une année : revenu net total (après impôt
    quand connu pour l'entrée, avant impôt en repli sinon) et taux d'épargne du foyer —
    argent réellement investi sur l'année rapporté à ce revenu net total. Jamais calculé
    entrée par entrée : avec plusieurs salaires, le montant investi (unique, au niveau du
    foyer) ne doit être rapporté qu'à la somme des revenus, pas répété pour chacun."""
    entrees = list_salaires_annee(db, user_id, annee)

    net_total = 0.0
    toutes_avec_taux = True
    for ligne in entrees:
        resume = compute_resume_entree(
            montant=ligne.montant,
            type_montant=ligne.type_montant,
            periodicite=ligne.periodicite,
            statut=ligne.statut,
            nombre_mois=ligne.nombre_mois,
            taux_imposition_pct=ligne.taux_imposition_pct,
        )
        if resume["net_apres_impot_annuel"] is not None:
            net_total += resume["net_apres_impot_annuel"]
        else:
            net_total += resume["net_avant_impot_annuel"]
            toutes_avec_taux = False

    montant_investi_annee = performance_service.montant_investi_periode(db, user_id, f"{annee}-01-01", f"{annee}-12-31")
    taux_epargne_pct = (montant_investi_annee / net_total * 100) if net_total > EPSILON else None

    return {
        "annee": annee,
        "nombre_salaires": len(entrees),
        "net_total_annuel": round(net_total, 2),
        "toutes_les_entrees_ont_un_taux_imposition": toutes_avec_taux,
        "montant_investi_annee": round(montant_investi_annee, 2),
        "taux_epargne_pct": round(taux_epargne_pct, 2) if taux_epargne_pct is not None else None,
    }


def list_salaires(db: Session, user_id: int) -> list[Salaire]:
    return db.query(Salaire).filter(Salaire.user_id == user_id).order_by(Salaire.annee.desc(), Salaire.id.asc()).all()


def list_salaires_annee(db: Session, user_id: int, annee: int) -> list[Salaire]:
    return db.query(Salaire).filter(Salaire.user_id == user_id, Salaire.annee == annee).order_by(Salaire.id.asc()).all()


def annees_avec_salaire(db: Session, user_id: int) -> list[int]:
    lignes = db.query(Salaire.annee).filter(Salaire.user_id == user_id).distinct().all()
    return sorted({a for (a,) in lignes}, reverse=True)


def get_salaire(db: Session, user_id: int, salaire_id: int) -> Salaire | None:
    return db.query(Salaire).filter(Salaire.user_id == user_id, Salaire.id == salaire_id).first()


def create_salaire(
    db: Session,
    user_id: int,
    *,
    annee: int,
    nom: str | None,
    montant: float,
    type_montant: str,
    periodicite: str,
    statut: str,
    nombre_mois: int,
    taux_imposition_pct: float | None,
) -> Salaire:
    ligne = Salaire(
        user_id=user_id,
        annee=annee,
        nom=nom or NOM_PAR_DEFAUT,
        montant=montant,
        type_montant=type_montant,
        periodicite=periodicite,
        statut=statut,
        nombre_mois=nombre_mois,
        taux_imposition_pct=taux_imposition_pct,
    )
    db.add(ligne)
    db.commit()
    db.refresh(ligne)
    return ligne


def update_salaire(
    db: Session,
    user_id: int,
    salaire_id: int,
    *,
    annee: int,
    nom: str | None,
    montant: float,
    type_montant: str,
    periodicite: str,
    statut: str,
    nombre_mois: int,
    taux_imposition_pct: float | None,
) -> Salaire | None:
    ligne = get_salaire(db, user_id, salaire_id)
    if ligne is None:
        return None
    ligne.annee = annee
    ligne.nom = nom or NOM_PAR_DEFAUT
    ligne.montant = montant
    ligne.type_montant = type_montant
    ligne.periodicite = periodicite
    ligne.statut = statut
    ligne.nombre_mois = nombre_mois
    ligne.taux_imposition_pct = taux_imposition_pct
    db.commit()
    db.refresh(ligne)
    return ligne


def delete_salaire(db: Session, user_id: int, salaire_id: int) -> bool:
    ligne = get_salaire(db, user_id, salaire_id)
    if ligne is None:
        return False
    db.delete(ligne)
    db.commit()
    return True
