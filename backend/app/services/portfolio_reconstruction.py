"""Reconstruction du portefeuille réel à partir du grand livre de transactions.

Méthode du coût moyen pondéré : les transactions sont traitées par symbole, dans
l'ordre chronologique. Les achats/ventes en bourse ajustent la quantité ET le
coût de base ; les opérations sur titres (splits, actions gratuites, migrations,
fusions...) n'ajustent que la quantité (coût nul), car elles s'équilibrent
historiquement à ~0 par titre chez ce type de courtier. Les investissements en
fonds non cotés (Private Markets) n'ont pas de champ `shares` : par convention on
les traite comme 1 part = 1€ investi, ce qui les valorise à leur coût (cohérent
avec l'absence de cotation publique).
"""

from dataclasses import dataclass, field
from datetime import datetime

from sqlalchemy.orm import Session

from ..models import Holding, Transaction

EPSILON = 1e-6


@dataclass
class PositionState:
    symbol: str
    name: str | None = None
    asset_class: str | None = None
    shares: float = 0.0
    cost_basis: float = 0.0
    realized_gain: float = 0.0
    # Flux de trésorerie côté investisseur (achat = négatif, vente = positif), utilisés
    # pour calculer un rendement annualisé (XIRR) par ligne — cf. performance_service.
    cash_flows: list[tuple[datetime, float]] = field(default_factory=list)
    # Quantité détenue après chaque transaction, pour reconstruire "combien je détenais
    # à telle date" — cf. historical_performance_service.
    shares_history: list[tuple[datetime, float]] = field(default_factory=list)
    # Capital cumulé investi (achats uniquement, jamais décrémenté à la vente) — sert de
    # ligne de base "capital investi" façon calculatrice d'intérêts composés.
    cumulative_invested: float = 0.0
    invested_history: list[tuple[datetime, float]] = field(default_factory=list)


def _apply_transaction(state: PositionState, tx: Transaction) -> None:
    state.name = tx.name or state.name
    state.asset_class = tx.asset_class or state.asset_class
    shares_changed = False

    if tx.category == "TRADING" and tx.type == "BUY" and tx.shares is not None:
        cost_added = -tx.amount + abs(tx.fee) + abs(tx.tax)
        state.shares += tx.shares
        state.cost_basis += cost_added
        state.cash_flows.append((tx.datetime_utc, -cost_added))
        state.cumulative_invested += cost_added
        state.invested_history.append((tx.datetime_utc, state.cumulative_invested))
        shares_changed = True

    elif tx.category == "TRADING" and tx.type == "SELL" and tx.shares is not None:
        proceeds = tx.amount + tx.fee + tx.tax
        shares_sold = -tx.shares
        avg_cost = (state.cost_basis / state.shares) if state.shares > EPSILON else 0.0
        cost_removed = avg_cost * shares_sold
        state.realized_gain += proceeds - cost_removed
        state.shares -= shares_sold
        state.cost_basis -= cost_removed
        state.cash_flows.append((tx.datetime_utc, proceeds))
        shares_changed = True

    elif tx.category == "CASH" and tx.type == "PRIVATE_MARKET_BUY":
        invested = -tx.amount
        state.shares += invested
        state.cost_basis += invested
        state.cash_flows.append((tx.datetime_utc, -invested))
        state.cumulative_invested += invested
        state.invested_history.append((tx.datetime_utc, state.cumulative_invested))
        shares_changed = True

    elif tx.category == "CASH" and tx.type == "DIVIDEND":
        # Le champ `shares` d'une ligne DIVIDEND indique le nombre de titres détenus
        # à la date de détachement (info de référence), pas une acquisition : il ne
        # doit surtout pas être additionné à la quantité détenue.
        pass

    elif tx.shares is not None:
        # Opérations sur titres (splits, actions gratuites, migrations, fusions, WORTHLESS...) : coût nul.
        state.shares += tx.shares
        shares_changed = True

    if shares_changed:
        state.shares_history.append((tx.datetime_utc, state.shares))


def compute_positions(db: Session) -> dict[str, PositionState]:
    transactions = (
        db.query(Transaction)
        .filter(Transaction.symbol.isnot(None), Transaction.symbol != "")
        .order_by(Transaction.datetime_utc.asc())
        .all()
    )

    positions: dict[str, PositionState] = {}
    for tx in transactions:
        state = positions.setdefault(tx.symbol, PositionState(symbol=tx.symbol))
        _apply_transaction(state, tx)

    return positions


def rebuild_holdings(db: Session) -> int:
    positions = compute_positions(db)

    db.query(Holding).delete()

    count = 0
    for state in positions.values():
        if state.shares <= EPSILON:
            continue
        prix_revient = state.cost_basis / state.shares
        db.add(
            Holding(
                ticker=state.symbol,
                nom=state.name,
                quantite=state.shares,
                prix_revient_moyen=prix_revient,
                type_actif=state.asset_class,
            )
        )
        count += 1

    db.commit()
    return count
