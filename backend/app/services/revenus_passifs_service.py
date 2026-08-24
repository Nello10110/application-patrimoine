"""Revenus passifs projetés à 12 mois (backlog 2.P.3, absorbe C.2) : rendement
courant du patrimoine (loyers nets, intérêts de livrets, dividendes, intérêts de
courtage), en **distinguant ce qui est certain de ce qui est estimé** plutôt que
d'abandonner la projection entière à cause de sa partie la moins fiable — c'est
précisément ce qui avait fait écarter C.2 (`dividendRate` de `yfinance`, peu fiable
pour les ETF).

- **Certain** : loyers nets annuels (bail signé, montant connu) et intérêts de
  livrets (taux déclaré par l'utilisateur, backlog 2.M.1 — `Holding.taux_pct`,
  appliqué à `valeur_estimee`).
- **Estimé** : dividendes et intérêts de courtage réellement perçus sur les 12
  DERNIERS mois glissants, extrapolés tels quels sur les 12 prochains — jamais un
  taux théorique par titre (`dividendRate`), toujours une observation directe du
  grand livre de CE portefeuille. Aucun appel `yfinance` : contrairement à P.2, cette
  fonction n'a besoin d'aucune nouvelle donnée de marché."""

from datetime import date, timedelta

from sqlalchemy.orm import Session

from ..models import Holding, HoldingImmobilierDetail, Transaction

TYPES_LIVRETS_AVEC_TAUX = ("REGULATED_SAVINGS", "EMPLOYEE_SAVINGS")


def _loyers_nets_annuels(db: Session, user_id: int) -> float:
    holdings_immobiliers = db.query(Holding).filter(Holding.user_id == user_id, Holding.type_actif == "REAL_ESTATE").all()
    if not holdings_immobiliers:
        return 0.0

    details = {
        d.holding_id: d
        for d in db.query(HoldingImmobilierDetail)
        .filter(HoldingImmobilierDetail.holding_id.in_([h.id for h in holdings_immobiliers]))
        .all()
    }

    total = 0.0
    for h in holdings_immobiliers:
        detail = details.get(h.id)
        if detail is None or detail.loyer_mensuel is None:
            continue
        loyer_annuel = detail.loyer_mensuel * 12
        charges_annuelles = (detail.charges_mensuelles or 0.0) * 12 + (detail.frais_annuels or 0.0)
        total += loyer_annuel - charges_annuelles
    return total


def _interets_livrets_annuels(db: Session, user_id: int) -> float:
    holdings = (
        db.query(Holding)
        .filter(Holding.user_id == user_id, Holding.type_actif.in_(TYPES_LIVRETS_AVEC_TAUX))
        .all()
    )
    return sum(h.valeur_estimee * h.taux_pct / 100 for h in holdings if h.valeur_estimee and h.taux_pct)


def _revenus_boursiers_douze_derniers_mois(db: Session, user_id: int) -> tuple[float, float]:
    """`(dividendes, interets_courtage)` réellement perçus sur les 365 derniers
    jours — la base d'extrapolation pour la partie ESTIMÉE de la projection."""
    depuis = (date.today() - timedelta(days=365)).isoformat()
    transactions = (
        db.query(Transaction)
        .filter(Transaction.user_id == user_id, Transaction.category == "CASH", Transaction.date >= depuis)
        .all()
    )
    dividendes = sum(tx.amount + tx.fee + tx.tax for tx in transactions if tx.type == "DIVIDEND")
    interets = sum(tx.amount + tx.fee + tx.tax for tx in transactions if tx.type == "INTEREST_PAYMENT")
    return dividendes, interets


def compute_revenus_passifs(db: Session, user_id: int) -> dict:
    loyers_nets_annuels = _loyers_nets_annuels(db, user_id)
    interets_livrets_annuels = _interets_livrets_annuels(db, user_id)
    revenu_certain_annuel = loyers_nets_annuels + interets_livrets_annuels

    dividendes_estimes, interets_courtage_estimes = _revenus_boursiers_douze_derniers_mois(db, user_id)
    revenu_estime_annuel = dividendes_estimes + interets_courtage_estimes

    revenu_total_annuel = revenu_certain_annuel + revenu_estime_annuel

    return {
        "loyers_nets_annuels": round(loyers_nets_annuels, 2),
        "interets_livrets_annuels": round(interets_livrets_annuels, 2),
        "revenu_certain_annuel": round(revenu_certain_annuel, 2),
        "dividendes_estimes_annuels": round(dividendes_estimes, 2),
        "interets_courtage_estimes_annuels": round(interets_courtage_estimes, 2),
        "revenu_estime_annuel": round(revenu_estime_annuel, 2),
        "revenu_total_projete_annuel": round(revenu_total_annuel, 2),
        "revenu_total_projete_mensuel": round(revenu_total_annuel / 12, 2),
    }
