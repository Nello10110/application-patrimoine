"""Reconstruction du portefeuille réel à partir du grand livre de transactions.

Méthode du coût moyen pondéré : les transactions sont traitées par symbole, dans
l'ordre chronologique. Les achats/ventes en bourse ajustent la quantité ET le
coût de base ; les opérations sur titres (splits, actions gratuites, migrations,
fusions...) n'ajustent que la quantité (coût nul), car elles s'équilibrent
historiquement à ~0 par titre chez ce type de courtier. Les investissements en
fonds non cotés (Private Markets) n'ont pas de champ `shares` : par convention on
les traite comme 1 part = 1€ BRUT investi (`-amount`, hors frais/taxes), ce qui
les valorise à leur coût brut (cohérent avec l'absence de cotation publique) ;
les frais/taxes, eux, alourdissent le coût de base — exactement comme pour un
achat en bourse — sans faire varier la quantité de parts.

Convention de données (établie par analyse de l'export réel) : `amount` est le
montant BRUT de l'opération ; `fee` (courtage) et `tax` (impôts/taxes) sont des
montants séparés et ALGÉBRIQUES — négatifs quand ce sont des charges, positifs
dans le cas (réel, observé) d'un remboursement. Toute l'arithmétique ci-dessous
est donc une simple somme algébrique (`amount + fee + tax`), jamais un `abs()`
qui transformerait un remboursement en charge.
"""

import logging
from dataclasses import dataclass, field
from datetime import datetime

from sqlalchemy.orm import Session

from ..models import Holding, Transaction

EPSILON = 1e-6

logger = logging.getLogger("outil_bourse.reconstruction")


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
    # Anomalies détectées lors de la reconstruction (ex. quantité résiduelle négative
    # faute d'achat correspondant) — remontées jusqu'à `rebuild_holdings` puis
    # `TransactionImportResult` pour être signalées à l'utilisateur après un import.
    anomalies: list[str] = field(default_factory=list)


def _apply_transaction(state: PositionState, tx: Transaction) -> None:
    state.name = tx.name or state.name
    state.asset_class = tx.asset_class or state.asset_class
    shares_changed = False

    if tx.category == "TRADING" and tx.type == "BUY" and tx.shares is not None:
        # Coût de revient = montant brut + frais + taxes (algébrique : amount est déjà
        # négatif pour un achat, fee/tax sont négatifs pour une charge).
        cost_added = -(tx.amount + tx.fee + tx.tax)
        state.shares += tx.shares
        state.cost_basis += cost_added
        state.cash_flows.append((tx.datetime_utc, -cost_added))
        state.cumulative_invested += cost_added
        state.invested_history.append((tx.datetime_utc, state.cumulative_invested))
        shares_changed = True

    elif tx.category == "TRADING" and tx.type == "SELL" and tx.shares is not None:
        # Produit net de la vente = montant brut + frais + taxes (algébrique).
        proceeds = tx.amount + tx.fee + tx.tax
        shares_sold = -tx.shares
        avg_cost = (state.cost_basis / state.shares) if state.shares > EPSILON else 0.0

        # Garde-fou sur le COÛT uniquement : on ne retire jamais du coût de base plus
        # que ce qu'il contient, sinon une vente portant sur plus de titres que détenu
        # (données incomplètes) le ferait passer en négatif et fausserait le prix de
        # revient de toute la position.
        cost_removed = min(avg_cost * shares_sold, max(state.cost_basis, 0.0))

        # La QUANTITÉ, elle, n'est volontairement pas bornée ici : chez ce type de
        # courtier, la vente d'un titre offert est parfois horodatée AVANT la ligne
        # d'acquisition correspondante (cas réel constaté : titre offert, vendu à
        # 16h12, ligne d'achat enregistrée à 16h20 le même jour). Borner à 0 dès la
        # vente ferait alors apparaître une position fantôme que l'utilisateur ne
        # détient pas. On laisse la quantité descendre sous zéro et on ne juge de
        # l'anomalie qu'à la fin du traitement (cf. `compute_positions`), une fois
        # que les lignes tardives ont eu l'occasion de rétablir l'équilibre.
        state.realized_gain += proceeds - cost_removed
        state.shares -= shares_sold
        state.cost_basis -= cost_removed
        state.cash_flows.append((tx.datetime_utc, proceeds))
        shares_changed = True

    elif tx.category == "CASH" and tx.type == "PRIVATE_MARKET_BUY":
        # Convention : 1 part = 1€ BRUT investi. La quantité de parts ne dépend que du
        # montant brut, mais le coût de revient (utilisé pour le prix de revient moyen
        # et le calcul de performance) intègre en plus les frais/taxes, exactement comme
        # un achat en bourse — c'était le seul flux orphelin (non compté nulle part).
        parts_ajoutees = -tx.amount
        montant_investi = -(tx.amount + tx.fee + tx.tax)
        state.shares += parts_ajoutees
        state.cost_basis += montant_investi
        state.cash_flows.append((tx.datetime_utc, -montant_investi))
        state.cumulative_invested += montant_investi
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

    for state in positions.values():
        _controler_coherence(state)

    return positions


def _controler_coherence(state: PositionState) -> None:
    """Contrôle de fin de traitement : une quantité résiduelle négative signale un
    grand livre réellement incomplet (une vente sans achat correspondant), par
    opposition à un simple décalage d'horodatage qui, lui, se résorbe de lui-même en
    cours de traitement. Seul ce cas résiduel est remonté comme anomalie."""
    if state.shares < -EPSILON:
        logger.warning(
            "Quantité négative en fin de reconstruction pour %s (%.6f) : le grand livre "
            "contient des ventes sans achat correspondant. Position ignorée.",
            state.symbol,
            state.shares,
        )
        state.anomalies.append(
            f"{state.symbol}: quantité négative en fin de reconstruction ({state.shares:.6f}) — "
            "vente(s) sans achat correspondant dans le grand livre"
        )


def rebuild_holdings(db: Session) -> tuple[int, int]:
    """Reconstruit les lignes du portefeuille depuis le grand livre.

    Renvoie `(positions_recalculees, anomalies_detectees)` : le nombre de lignes
    de portefeuille recréées, et le nombre total d'anomalies détectées (1.4) toutes
    positions confondues (ex. ventes supérieures à la quantité détenue).
    """
    positions = compute_positions(db)

    db.query(Holding).delete()

    count = 0
    anomalies_detectees = sum(len(state.anomalies) for state in positions.values())
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
    return count, anomalies_detectees
