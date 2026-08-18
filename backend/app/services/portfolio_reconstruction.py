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

from ..models import ORIGINE_MANUEL, ORIGINE_RECONSTRUIT, Holding, Transaction
from . import historique_cache

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


def compute_position(db: Session, ticker: str) -> PositionState | None:
    """Reconstruction ciblée sur un seul ticker (cf. LOT 4.2) : ne relit que les
    transactions de ce ticker plutôt que de rejouer tout le grand livre pour n'en
    garder qu'une position, comme le faisait `holding_detail_service` en passant par
    `compute_positions(db)` complet pour afficher une seule fiche. Résultat
    rigoureusement identique à `compute_positions(db).get(ticker)` — même fonction
    de traitement (`_apply_transaction`/`_controler_coherence`) appliquée aux mêmes
    transactions, seule la requête source change (filtrée par ticker plutôt que
    ramenant tout le grand livre). Renvoie `None` si ce ticker n'a aucune
    transaction (pas de ligne dans `positions` pour lui, comme `compute_positions`)."""
    transactions = db.query(Transaction).filter(Transaction.symbol == ticker).order_by(Transaction.datetime_utc.asc()).all()
    if not transactions:
        return None

    state = PositionState(symbol=ticker)
    for tx in transactions:
        _apply_transaction(state, tx)
    _controler_coherence(state)
    return state


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


@dataclass
class ReconstructionResult:
    """Résultat de `rebuild_holdings` (LOT 3.4) : nombre de lignes de portefeuille
    recréées, d'anomalies détectées (cf. `_controler_coherence`), et de lignes
    saisies manuellement supprimées car le grand livre reconstruit un ticker
    identique (le grand livre fait foi — cf. docstring de `models.Holding.origine`)."""

    positions_recalculees: int
    anomalies_detectees: int
    lignes_manuelles_remplacees: int


def rebuild_holdings(db: Session) -> ReconstructionResult:
    """Reconstruit les lignes du portefeuille depuis le grand livre.

    Arbitrage saisie manuelle / reconstruction (LOT 3.4) : seules les lignes
    `origine=ORIGINE_RECONSTRUIT` sont supprimées puis recréées — une ligne saisie
    à la main (`ORIGINE_MANUEL`) survit à cet appel, sauf si le grand livre
    reconstruit justement une position sur le même ticker, auquel cas le grand
    livre fait foi : la ligne manuelle est supprimée (elle ferait doublon dans tous
    les calculs) et l'événement est journalisé en warning et compté.
    """
    positions = compute_positions(db)

    lignes_manuelles_existantes = {h.ticker: h for h in db.query(Holding).filter(Holding.origine == ORIGINE_MANUEL).all()}

    db.query(Holding).filter(Holding.origine == ORIGINE_RECONSTRUIT).delete()

    count = 0
    lignes_manuelles_remplacees = 0
    anomalies_detectees = sum(len(state.anomalies) for state in positions.values())
    for state in positions.values():
        if state.shares <= EPSILON:
            continue

        ligne_manuelle = lignes_manuelles_existantes.get(state.symbol)
        if ligne_manuelle is not None:
            logger.warning(
                "Ligne saisie manuellement pour %s remplacée par la reconstruction depuis le grand "
                "livre (même ticker) : le grand livre fait foi.",
                state.symbol,
            )
            db.delete(ligne_manuelle)
            lignes_manuelles_remplacees += 1

        prix_revient = state.cost_basis / state.shares
        db.add(
            Holding(
                ticker=state.symbol,
                nom=state.name,
                quantite=state.shares,
                prix_revient_moyen=prix_revient,
                type_actif=state.asset_class,
                origine=ORIGINE_RECONSTRUIT,
            )
        )
        count += 1

    db.commit()

    # Le portefeuille vient de changer : tout historique en cache (LOT 4.4/4.5,
    # `services/historique_cache.py`) est potentiellement caduc — quantités détenues
    # différentes à chaque date, nouvelles/disparues lignes. Purge complète plutôt que
    # ciblée : `rebuild_holdings` ne connaît pas la liste des tickers avant reconstruction
    # (une ligne peut disparaître), et c'est un événement rare (import), pas un chemin chaud.
    historique_cache.invalider(db)

    return ReconstructionResult(
        positions_recalculees=count,
        anomalies_detectees=anomalies_detectees,
        lignes_manuelles_remplacees=lignes_manuelles_remplacees,
    )
