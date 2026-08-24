"""Objectifs suivis dans le temps (backlog 2.O.1) et indicateurs de situation
(backlog 2.O.2). Distinct du simulateur (§ B.1/B.2, calcul à la volée sans rien
conserver) : un objectif est persisté, sa progression réelle réutilise la
valorisation déjà en place (pas un registre de versements séparé)."""

from datetime import date, datetime

from sqlalchemy.orm import Session

from ..models import (
    Detenteur,
    Holding,
    Loan,
    Objectif,
    ObjectifActif,
    ObjectifContributeur,
    TYPE_ACTIF_CASH_ACCOUNT,
    TYPE_ACTIF_REGULATED_SAVINGS,
    TYPES_ACTIF_PATRIMOINE_MANUEL,
    TYPES_OBJECTIF,
)
from . import analysis_service, budget_service, patrimoine_service

# Types "liquides" au sens du matelas de sécurité (backlog 2.O.2) : disponibles
# sans délai ni pénalité, contrairement au reste de `TYPES_ACTIF_PATRIMOINE_MANUEL`
# (immobilier, assurance-vie, PER... — tous ont un coût ou un délai de sortie).
TYPES_LIQUIDES = {TYPE_ACTIF_CASH_ACCOUNT, TYPE_ACTIF_REGULATED_SAVINGS}

_JOURS_PAR_MOIS = 30.4375  # mois moyen (365.25 / 12), pour des calculs financiers stables


def _mois_entre(d1: date, d2: date) -> float:
    return (d2 - d1).days / _JOURS_PAR_MOIS


def _valeur_actuelle_holdings(db: Session, holding_ids: list[int]) -> float:
    if not holding_ids:
        return 0.0
    holdings = db.query(Holding).filter(Holding.id.in_(holding_ids)).all()
    return sum(v.valeur for v in analysis_service.value_holdings(holdings))


# ---------------------------------------------------------------------------
# CRUD
# ---------------------------------------------------------------------------


def list_objectifs(db: Session, user_id: int) -> list[Objectif]:
    return db.query(Objectif).filter(Objectif.user_id == user_id).order_by(Objectif.echeance).all()


def _valider_holdings(db: Session, user_id: int, holding_ids: list[int]) -> None:
    trouves = db.query(Holding.id).filter(Holding.id.in_(holding_ids), Holding.user_id == user_id).count()
    if trouves != len(set(holding_ids)):
        raise ValueError("Un ou plusieurs actifs rattachés sont introuvables")


def _valider_detenteurs(db: Session, user_id: int, detenteur_ids: list[int]) -> None:
    trouves = db.query(Detenteur.id).filter(Detenteur.id.in_(detenteur_ids), Detenteur.user_id == user_id).count()
    if trouves != len(set(detenteur_ids)):
        raise ValueError("Un ou plusieurs contributeurs sont introuvables")


def create_objectif(
    db: Session,
    user_id: int,
    nom: str,
    type_: str,
    montant_cible: float,
    echeance: str,
    rendement_hypothese_pct: float,
    holding_ids: list[int],
    detenteur_ids: list[int],
) -> Objectif:
    if type_ not in TYPES_OBJECTIF:
        raise ValueError("Type d'objectif inconnu")
    _valider_holdings(db, user_id, holding_ids)
    _valider_detenteurs(db, user_id, detenteur_ids)

    valeur_initiale = _valeur_actuelle_holdings(db, holding_ids)
    objectif = Objectif(
        user_id=user_id,
        nom=nom.strip(),
        type=type_,
        montant_cible=montant_cible,
        echeance=echeance,
        rendement_hypothese_pct=rendement_hypothese_pct,
        valeur_a_la_creation=valeur_initiale,
    )
    db.add(objectif)
    db.flush()  # pour obtenir objectif.id avant les lignes de rattachement
    for hid in set(holding_ids):
        db.add(ObjectifActif(objectif_id=objectif.id, holding_id=hid))
    for did in set(detenteur_ids):
        db.add(ObjectifContributeur(objectif_id=objectif.id, detenteur_id=did))
    db.commit()
    db.refresh(objectif)
    return objectif


def _objectif_du_foyer(db: Session, user_id: int, objectif_id: int) -> Objectif:
    objectif = db.query(Objectif).filter(Objectif.id == objectif_id, Objectif.user_id == user_id).first()
    if objectif is None:
        raise ValueError("Objectif introuvable")
    return objectif


def delete_objectif(db: Session, user_id: int, objectif_id: int) -> None:
    objectif = _objectif_du_foyer(db, user_id, objectif_id)
    db.query(ObjectifActif).filter(ObjectifActif.objectif_id == objectif.id).delete()
    db.query(ObjectifContributeur).filter(ObjectifContributeur.objectif_id == objectif.id).delete()
    db.delete(objectif)
    db.commit()


# ---------------------------------------------------------------------------
# Détail : progression, trajectoire, diagnostic (backlog 2.O.1)
# ---------------------------------------------------------------------------


def compute_detail(db: Session, user_id: int, objectif: Objectif) -> dict:
    liens_actifs = db.query(ObjectifActif).filter(ObjectifActif.objectif_id == objectif.id).all()
    holding_ids = [a.holding_id for a in liens_actifs]
    holdings = db.query(Holding).filter(Holding.id.in_(holding_ids)).all() if holding_ids else []
    valeur_actuelle = sum(v.valeur for v in analysis_service.value_holdings(holdings))
    actifs_rattaches = [{"holding_id": h.id, "ticker": h.ticker, "nom": h.nom} for h in holdings]

    liens_contributeurs = db.query(ObjectifContributeur).filter(ObjectifContributeur.objectif_id == objectif.id).all()
    detenteur_ids = [c.detenteur_id for c in liens_contributeurs]
    contributeurs = (
        [{"id": d.id, "nom": d.nom} for d in db.query(Detenteur).filter(Detenteur.id.in_(detenteur_ids)).all()]
        if detenteur_ids
        else []
    )

    aujourdhui = date.today()
    date_creation = objectif.created_at.date() if isinstance(objectif.created_at, datetime) else objectif.created_at
    date_echeance = date.fromisoformat(objectif.echeance)

    mois_totaux = _mois_entre(date_creation, date_echeance)
    mois_ecoules = _mois_entre(date_creation, aujourdhui)
    mois_restants = max(0.0, _mois_entre(aujourdhui, date_echeance))

    progression_pct = round(valeur_actuelle / objectif.montant_cible * 100, 1) if objectif.montant_cible > 0 else None

    # Trajectoire cible : droite du montant de départ (à la création) au montant
    # cible (à l'échéance) — la façon la plus simple d'exprimer "il faut avoir
    # accumulé X à telle date pour rester dans les temps".
    if mois_totaux > 0:
        fraction_ecoulee = min(1.0, max(0.0, mois_ecoules / mois_totaux))
        valeur_attendue_aujourdhui = objectif.valeur_a_la_creation + (objectif.montant_cible - objectif.valeur_a_la_creation) * fraction_ecoulee
    else:
        valeur_attendue_aujourdhui = objectif.montant_cible

    retard_mois: int | None = None
    if valeur_actuelle >= objectif.montant_cible:
        diagnostic = "atteint"
    elif date_echeance < aujourdhui:
        diagnostic = "echeance_depassee"
    elif valeur_actuelle >= valeur_attendue_aujourdhui:
        diagnostic = "en_bonne_voie"
    else:
        rythme_mensuel = (valeur_actuelle - objectif.valeur_a_la_creation) / mois_ecoules if mois_ecoules > 0.5 else 0.0
        if rythme_mensuel > 0:
            mois_necessaires_au_rythme_actuel = (objectif.montant_cible - objectif.valeur_a_la_creation) / rythme_mensuel
            retard_mois = round(mois_necessaires_au_rythme_actuel - mois_totaux)
            diagnostic = "en_retard" if retard_mois > 0 else "en_bonne_voie"
        else:
            diagnostic = "aucune_progression"

    # Rendement annuel requis pour atteindre la cible SANS versement
    # supplémentaire — résolution directe (pas de bissection nécessaire, la
    # formule s'inverse analytiquement).
    rendement_requis_pct = None
    if valeur_actuelle > 0 and mois_restants > 0 and objectif.montant_cible > valeur_actuelle:
        annees_restantes = mois_restants / 12
        rendement_requis_pct = round(((objectif.montant_cible / valeur_actuelle) ** (1 / annees_restantes) - 1) * 100, 2)

    # Contribution mensuelle nécessaire au taux hypothèse renseigné (0% par
    # défaut) pour combler l'écart d'ici l'échéance — formule fermée de la valeur
    # future d'une suite de versements constants, pas de bissection non plus.
    contribution_mensuelle_necessaire = None
    if mois_restants > 0:
        i = (1 + objectif.rendement_hypothese_pct / 100) ** (1 / 12) - 1
        n = mois_restants
        valeur_projetee_sans_versement = valeur_actuelle * (1 + i) ** n
        manque = objectif.montant_cible - valeur_projetee_sans_versement
        if manque <= 0:
            contribution_mensuelle_necessaire = 0.0
        elif abs(i) > 1e-9:
            facteur = ((1 + i) ** n - 1) / i
            contribution_mensuelle_necessaire = round(manque / facteur, 2)
        else:
            contribution_mensuelle_necessaire = round(manque / n, 2)

    return {
        "id": objectif.id,
        "nom": objectif.nom,
        "type": objectif.type,
        "montant_cible": objectif.montant_cible,
        "echeance": objectif.echeance,
        "rendement_hypothese_pct": objectif.rendement_hypothese_pct,
        "created_at": objectif.created_at,
        "valeur_a_la_creation": round(objectif.valeur_a_la_creation, 2),
        "valeur_actuelle": round(valeur_actuelle, 2),
        "progression_pct": progression_pct,
        "diagnostic": diagnostic,
        "retard_mois": retard_mois if diagnostic == "en_retard" else None,
        "rendement_requis_pct": rendement_requis_pct,
        "contribution_mensuelle_necessaire": contribution_mensuelle_necessaire,
        "trajectoire_cible": [
            {"date": date_creation.isoformat(), "valeur": round(objectif.valeur_a_la_creation, 2)},
            {"date": objectif.echeance, "valeur": round(objectif.montant_cible, 2)},
        ],
        "trajectoire_reelle": [
            {"date": date_creation.isoformat(), "valeur": round(objectif.valeur_a_la_creation, 2)},
            {"date": aujourdhui.isoformat(), "valeur": round(valeur_actuelle, 2)},
        ],
        "actifs_rattaches": actifs_rattaches,
        "contributeurs": contributeurs,
    }


def list_objectifs_detail(db: Session, user_id: int) -> list[dict]:
    return [compute_detail(db, user_id, o) for o in list_objectifs(db, user_id)]


def get_objectif_detail(db: Session, user_id: int, objectif_id: int) -> dict:
    objectif = _objectif_du_foyer(db, user_id, objectif_id)
    return compute_detail(db, user_id, objectif)


# ---------------------------------------------------------------------------
# Indicateurs de situation (backlog 2.O.2)
# ---------------------------------------------------------------------------


def compute_indicateurs_situation(db: Session, user_id: int) -> dict:
    holdings = db.query(Holding).filter(Holding.user_id == user_id).all()
    valued = analysis_service.value_holdings(holdings)

    epargne_disponible = sum(v.valeur for v in valued if v.holding.type_actif in TYPES_LIQUIDES)
    actifs_non_liquides = sum(
        v.valeur for v in valued if v.holding.type_actif in TYPES_ACTIF_PATRIMOINE_MANUEL and v.holding.type_actif not in TYPES_LIQUIDES
    )

    patrimoine = patrimoine_service.compute_patrimoine_net(db, user_id)
    patrimoine_brut = patrimoine["actifs_totaux"]

    aujourdhui = date.today()
    date_fin = aujourdhui.isoformat()
    mois = aujourdhui.month - 2
    annee = aujourdhui.year
    while mois <= 0:
        mois += 12
        annee -= 1
    date_debut = date(annee, mois, 1)
    summary = budget_service.compute_summary(db, user_id, date_debut.isoformat(), date_fin)

    nb_mois = 3.0
    depenses_mensuelles = summary["sorties"] / nb_mois if summary["sorties"] > 0 else None
    revenus_nets_mensuels = summary["entrees"] / nb_mois if summary["entrees"] > 0 else None

    loans = db.query(Loan).filter(Loan.user_id == user_id).all()
    mensualites_totales = sum(loan.mensualite for loan in loans)

    return {
        "matelas_securite_mois": round(epargne_disponible / depenses_mensuelles, 1) if depenses_mensuelles else None,
        "taux_endettement_pct": round(mensualites_totales / revenus_nets_mensuels * 100, 1) if revenus_nets_mensuels else None,
        "part_immobilisee_pct": round(actifs_non_liquides / patrimoine_brut * 100, 1) if patrimoine_brut > 0 else None,
        "epargne_disponible": round(epargne_disponible, 2),
        "depenses_mensuelles_moyennes": round(depenses_mensuelles, 2) if depenses_mensuelles else None,
        "mensualites_totales": round(mensualites_totales, 2),
        "revenus_nets_mensuels_moyens": round(revenus_nets_mensuels, 2) if revenus_nets_mensuels else None,
    }
