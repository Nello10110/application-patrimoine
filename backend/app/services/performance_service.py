"""Calcul de la rentabilité globale du portefeuille — exclusivement à partir de
l'activité boursière (achats/ventes de titres, dividendes, intérêts, frais).
Les virements avec la banque (dépôts/retraits sur le compte courant) sont hors
suivi boursier et ne sont même pas stockés (cf. `transaction_import.py`) : cette
appli ne calcule donc ni "solde de cash", ni "net investi" au sens bancaire.
"""

from datetime import datetime, timezone

from sqlalchemy.orm import Session

from ..models import Holding, Transaction
from . import analysis_service, portfolio_reconstruction

EPSILON = 1e-6


def xirr(cash_flows: list[tuple[datetime, float]]) -> float | None:
    if len(cash_flows) < 2:
        return None

    flows = sorted(cash_flows, key=lambda cf: cf[0])
    t0 = flows[0][0]

    def npv(rate: float) -> float:
        total = 0.0
        for date, amount in flows:
            days = (date - t0).days
            total += amount / ((1 + rate) ** (days / 365.0))
        return total

    low, high = -0.999999, 100.0
    npv_low, npv_high = npv(low), npv(high)
    if npv_low == 0:
        return low * 100
    if npv_high == 0:
        return high * 100
    if npv_low * npv_high > 0:
        return None  # pas de changement de signe : pas de solution fiable par bissection

    mid = low
    for _ in range(200):
        mid = (low + high) / 2
        npv_mid = npv(mid)
        if abs(npv_mid) < 1e-6:
            break
        if npv_low * npv_mid < 0:
            high = mid
        else:
            low = mid
            npv_low = npv_mid

    return mid * 100


def compute_performance(db: Session) -> dict:
    transactions = db.query(Transaction).order_by(Transaction.datetime_utc.asc()).all()

    dividendes_percus = sum(tx.amount for tx in transactions if tx.category == "CASH" and tx.type == "DIVIDEND")
    interets_percus = sum(tx.amount for tx in transactions if tx.category == "CASH" and tx.type == "INTEREST_PAYMENT")
    frais_payes = sum(abs(tx.fee) + abs(tx.tax) for tx in transactions)

    cout_total_investi = 0.0
    for tx in transactions:
        if tx.category == "TRADING" and tx.type == "BUY" and tx.shares is not None:
            cout_total_investi += -tx.amount + abs(tx.fee) + abs(tx.tax)
        elif tx.category == "CASH" and tx.type == "PRIVATE_MARKET_BUY":
            cout_total_investi += -tx.amount

    holdings = db.query(Holding).all()
    valued = analysis_service.value_holdings(holdings)
    valeur_positions = sum(v.valeur for v in valued)

    positions = portfolio_reconstruction.compute_positions(db)
    gains_realises = sum(state.realized_gain for state in positions.values())
    cout_base_ouvert = sum(state.cost_basis for state in positions.values() if state.shares > portfolio_reconstruction.EPSILON)
    gains_latents = valeur_positions - cout_base_ouvert

    gain_perte_total = gains_latents + gains_realises + dividendes_percus + interets_percus - frais_payes
    rendement_simple_pct = (gain_perte_total / cout_total_investi * 100) if cout_total_investi > EPSILON else None

    # Rendement annualisé (XIRR) sur les flux d'achats/ventes agrégés de toutes les
    # positions — même méthode que par ligne (cf. compute_holding_returns), étendue
    # à tout le portefeuille : aucune dépendance aux virements bancaires.
    cash_flows: list[tuple[datetime, float]] = []
    for state in positions.values():
        cash_flows.extend(state.cash_flows)
    if cash_flows:
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        cash_flows.append((now, valeur_positions))
    rendement_annualise_pct = xirr(cash_flows)

    premiere_transaction = next((tx.date for tx in transactions if tx.category == "TRADING" and tx.type == "BUY"), None)

    return {
        "valeur_positions": round(valeur_positions, 2),
        "valeur_totale": round(valeur_positions, 2),
        "cout_total_investi": round(cout_total_investi, 2),
        "gain_perte_total": round(gain_perte_total, 2),
        "rendement_simple_pct": round(rendement_simple_pct, 2) if rendement_simple_pct is not None else None,
        "rendement_annualise_pct": round(rendement_annualise_pct, 2) if rendement_annualise_pct is not None else None,
        "dividendes_percus": round(dividendes_percus, 2),
        "interets_percus": round(interets_percus, 2),
        "frais_payes": round(frais_payes, 2),
        "gains_realises": round(gains_realises, 2),
        "gains_latents": round(gains_latents, 2),
        "nombre_transactions": len(transactions),
        "premiere_transaction": premiere_transaction,
    }


def compute_holding_returns(db: Session) -> dict[str, dict]:
    """Rendement par ligne du portefeuille :
    - `depuis_achat` : simple (prix actuel vs prix de revient), calculable pour toute ligne
      ayant un prix de revient et un prix actuel (y compris les lignes saisies manuellement).
    - `annualise` : XIRR sur les flux de trésorerie réels de cette ligne (achats/ventes),
      donc uniquement disponible pour les positions reconstruites depuis l'historique de
      transactions (une ligne ajoutée manuellement n'a pas de date d'achat connue).
    """
    holdings = db.query(Holding).all()
    valued = analysis_service.value_holdings(holdings)
    positions = portfolio_reconstruction.compute_positions(db)
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    results: dict[str, dict] = {}
    for v in valued:
        h = v.holding
        depuis_achat = None
        if h.prix_revient_moyen and h.prix_revient_moyen > EPSILON and h.market_data and h.market_data.prix_actuel:
            depuis_achat = (h.market_data.prix_actuel / h.prix_revient_moyen - 1) * 100

        annualise = None
        state = positions.get(h.ticker)
        if state and state.cash_flows and v.a_des_donnees:
            # Sans prix de marché réel, la ligne est valorisée à son coût : un XIRR
            # calculé sur ce flux fictif afficherait un 0% trompeur plutôt qu'une
            # vraie mesure de performance. On préfère ne rien afficher dans ce cas.
            flows = list(state.cash_flows) + [(now, v.valeur)]
            annualise = xirr(flows)

        results[h.ticker] = {
            "rendement_depuis_achat_pct": round(depuis_achat, 2) if depuis_achat is not None else None,
            "rendement_annualise_pct": round(annualise, 2) if annualise is not None else None,
        }

    return results
