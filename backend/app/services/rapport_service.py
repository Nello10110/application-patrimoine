"""Rapport mensuel récapitulatif (roadmap Phase 4, § D.2) — équivalent du « rapport
mensuel » de Finary, mais sans envoi : l'application n'a pas de serveur mail, le
rapport est généré à la demande plutôt que poussé automatiquement. Trois éléments
pour le mois demandé : évolution de la valeur du portefeuille, plus gros mouvements
(en valeur absolue) et dividendes perçus — tous dérivés de données déjà calculées
ailleurs (`historical_performance_service`, `Transaction`), aucun nouveau calcul de
fond, uniquement une agrégation par mois."""

import calendar

from sqlalchemy.orm import Session

from ..models import Transaction
from . import historical_performance_service

NOMBRE_PLUS_GROS_MOUVEMENTS = 5


def _valeur_a_ou_avant(points: list[dict], date_str: str) -> float | None:
    """Dernière valeur connue à date <= `date_str` parmi `points` (triés par date
    croissante). Si `date_str` précède le tout premier point (le portefeuille n'existait
    pas encore à cette date), retombe sur ce premier point plutôt que `None` — un
    "avant/après" du tout début d'historique reste plus honnête qu'une case vide."""
    candidat = None
    for p in points:
        if p["date"] <= date_str:
            candidat = p["valeur_portefeuille"]
        else:
            break
    if candidat is not None:
        return candidat
    return points[0]["valeur_portefeuille"] if points else None


def compute_rapport_mensuel(db: Session, annee: int, mois: int) -> dict:
    debut = f"{annee:04d}-{mois:02d}-01"
    dernier_jour = calendar.monthrange(annee, mois)[1]
    fin = f"{annee:04d}-{mois:02d}-{dernier_jour:02d}"

    points = historical_performance_service.compute_portfolio_history(db)
    valeur_debut = _valeur_a_ou_avant(points, debut)
    valeur_fin = _valeur_a_ou_avant(points, fin)
    evolution_pct = (
        round((valeur_fin - valeur_debut) / valeur_debut * 100, 2)
        if valeur_debut is not None and valeur_debut > 1e-9 and valeur_fin is not None
        else None
    )

    transactions_du_mois = (
        db.query(Transaction)
        .filter(Transaction.date >= debut, Transaction.date <= fin)
        .order_by(Transaction.datetime_utc.asc())
        .all()
    )

    plus_gros_mouvements = sorted(transactions_du_mois, key=lambda tx: abs(tx.amount), reverse=True)[
        :NOMBRE_PLUS_GROS_MOUVEMENTS
    ]

    dividendes_percus = sum(
        tx.amount + tx.fee + tx.tax for tx in transactions_du_mois if tx.category == "CASH" and tx.type == "DIVIDEND"
    )

    return {
        "annee": annee,
        "mois": mois,
        "valeur_debut_mois": round(valeur_debut, 2) if valeur_debut is not None else None,
        "valeur_fin_mois": round(valeur_fin, 2) if valeur_fin is not None else None,
        "evolution_pct": evolution_pct,
        "dividendes_percus": round(dividendes_percus, 2),
        "nombre_transactions": len(transactions_du_mois),
        "plus_gros_mouvements": [
            {
                "date": tx.date,
                "type": tx.type,
                "symbol": tx.symbol,
                "nom": tx.name,
                "montant": round(tx.amount + tx.fee + tx.tax, 2),
            }
            for tx in plus_gros_mouvements
        ],
    }
