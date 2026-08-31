"""Fiche immobilier complète (backlog § 2.M.3) : détail locatif d'un bien
(`HoldingImmobilierDetail`), calcul de cashflow/rentabilité, et historique daté des
valorisations manuelles (`HoldingValuationHistory`) — jamais écrasé, contrairement à
`Holding.valeur_estimee`/`date_valeur_estimee` qui ne portent que la valeur COURANTE.

Cashflow mensuel = loyer − charges − frais/12 − mensualité de l'emprunt rattaché
(`Loan.holding_id`, backlog § 2.M.2). Rentabilité brute = loyer annuel / prix
d'acquisition ; nette = (loyer annuel − charges annuelles − frais annuels) / prix
d'acquisition. `prix d'acquisition` = `Holding.prix_revient_moyen` (montant investi à
l'origine, déjà ce sens ailleurs dans l'application — cf. `models.Holding`)."""

from datetime import datetime

from sqlalchemy.orm import Session

from ..models import Holding, HoldingImmobilierDetail, HoldingValuationHistory, Loan


def detail_immobilier(db: Session, holding_id: int) -> HoldingImmobilierDetail | None:
    return db.query(HoldingImmobilierDetail).filter(HoldingImmobilierDetail.holding_id == holding_id).first()


def upsert_detail_immobilier(db: Session, holding_id: int, **champs) -> HoldingImmobilierDetail:
    detail = detail_immobilier(db, holding_id)
    if detail is None:
        detail = HoldingImmobilierDetail(holding_id=holding_id)
        db.add(detail)
    for cle, valeur in champs.items():
        setattr(detail, cle, valeur)
    db.commit()
    db.refresh(detail)
    return detail


def enregistrer_point_historique(
    db: Session, holding_id: int, valeur: float, date_valeur: datetime, versement: float | None = None
) -> None:
    """Ajoute un point à l'historique — n'écrase jamais un point existant, même à la
    même date (deux estimations le même jour restent deux lignes distinctes, la plus
    récente en base fait foi pour l'affichage de la valeur "courante" ailleurs).

    `versement` (backlog § U.2, retour utilisateur 30/08/2026) : part de la hausse
    (ou baisse) depuis le point précédent que le foyer déclare venir d'un versement
    plutôt que d'une performance du contrat — `None` par défaut (jamais renseigné
    par `create_holding`/`update_holding`, qui stampent une valeur "courante" sans
    notion de versement ; seule la route dédiée `PUT .../valorisation` le propose)."""
    db.add(HoldingValuationHistory(holding_id=holding_id, valeur=valeur, date_valeur=date_valeur, versement=versement))
    db.commit()


def modifier_point_historique(
    db: Session, point_id: int, valeur: float, date_valeur: datetime, versement: float | None = None
) -> HoldingValuationHistory | None:
    """Corrige un point déjà saisi (backlog quickwin § T.3, retour utilisateur
    30/08/2026) — jusqu'ici, `enregistrer_point_historique` n'ajoutait qu'en
    aveugle, sans aucun moyen de revenir sur une valeur tapée par erreur.
    `None` si `point_id` n'existe pas ; l'appartenance au bon foyer (via
    `holding_id`) est vérifiée par l'appelant (`routers/portfolio.py`), pas ici —
    cette fonction ne connaît que la table, pas l'utilisateur courant."""
    point = db.get(HoldingValuationHistory, point_id)
    if point is None:
        return None
    point.valeur = valeur
    point.date_valeur = date_valeur
    point.versement = versement
    db.commit()
    db.refresh(point)
    return point


def supprimer_point_historique(db: Session, point_id: int) -> bool:
    """Supprime un point saisi par erreur (backlog quickwin § T.3). `False` si
    `point_id` n'existe pas déjà — même contrat de vérification d'appartenance
    que `modifier_point_historique` ci-dessus."""
    point = db.get(HoldingValuationHistory, point_id)
    if point is None:
        return False
    db.delete(point)
    db.commit()
    return True


def historique_valorisation(db: Session, holding_id: int) -> list[HoldingValuationHistory]:
    return (
        db.query(HoldingValuationHistory)
        .filter(HoldingValuationHistory.holding_id == holding_id)
        .order_by(HoldingValuationHistory.date_valeur)
        .all()
    )


def _arrondi(valeur: float | None) -> float | None:
    return round(valeur, 2) if valeur is not None else None


def calculer_cashflow_et_rentabilite(
    db: Session, holding: Holding, detail: HoldingImmobilierDetail | None, valeur: float
) -> dict:
    """Renvoie un dict prêt à fusionner dans `HoldingImmobilierOut` — toutes les clés
    valent `None` si `detail` est absent ou si `loyer_mensuel` n'est pas renseigné
    (rien à calculer sans loyer, même si charges/frais existent seuls). `valeur` est
    la valeur déjà résolue par `holding_detail_service.build_holding_detail` (même
    règle partout : `valeur_estimee`, à défaut prix × quantité) — pas re-dérivée ici,
    pour ne jamais diverger du chiffre déjà affiché sur la fiche."""
    vide = {
        "cashflow_mensuel": None,
        "rentabilite_brute_pct": None,
        "rentabilite_nette_pct": None,
        "prix_m2": None,
        "emprunt_mensualite": None,
    }
    if detail is None:
        return vide

    prix_m2 = valeur / detail.surface_m2 if detail.surface_m2 else None
    vide["prix_m2"] = _arrondi(prix_m2)

    if detail.loyer_mensuel is None:
        return vide

    emprunt = db.query(Loan).filter(Loan.holding_id == holding.id).first()
    mensualite = emprunt.mensualite if emprunt is not None else 0.0
    charges = detail.charges_mensuelles or 0.0
    frais_mensuels = (detail.frais_annuels or 0.0) / 12
    cashflow_mensuel = detail.loyer_mensuel - charges - frais_mensuels - mensualite

    rentabilite_brute_pct = None
    rentabilite_nette_pct = None
    if holding.prix_revient_moyen:
        loyer_annuel = detail.loyer_mensuel * 12
        rentabilite_brute_pct = loyer_annuel / holding.prix_revient_moyen * 100
        charges_annuelles = charges * 12 + (detail.frais_annuels or 0.0)
        rentabilite_nette_pct = (loyer_annuel - charges_annuelles) / holding.prix_revient_moyen * 100

    return {
        "cashflow_mensuel": _arrondi(cashflow_mensuel),
        "rentabilite_brute_pct": _arrondi(rentabilite_brute_pct),
        "rentabilite_nette_pct": _arrondi(rentabilite_nette_pct),
        "prix_m2": vide["prix_m2"],
        "emprunt_mensualite": _arrondi(mensualite) if emprunt is not None else None,
    }
