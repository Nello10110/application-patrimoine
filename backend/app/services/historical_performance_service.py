"""Historique de la valeur du portefeuille dans le temps, pour le graphique
d'évolution du tableau de bord. Contrairement au reste de l'application (cours
instantanés via `.info`), ce module s'appuie sur `yfinance` `.history()` pour
récupérer des séries de prix hebdomadaires depuis la première transaction —
un appel par titre/devise, jamais un appel par date.

Les deux fonctions publiques (`compute_portfolio_history`, `compute_holding_price_history`)
sont mises en cache via `services/historique_cache.py` (cf. LOT 4.4/4.5) : plusieurs
secondes d'appels réseau à chaque ouverture de fiche/tableau de bord, pour une série
hebdomadaire qui ne bouge qu'une fois par jour au mieux.
"""

import bisect
from datetime import datetime, timedelta, timezone

import pandas as pd
import yfinance as yf
from sqlalchemy.orm import Session

from ..models import Holding, Transaction
from . import analysis_service, historique_cache, market_data_service, performance_service, portfolio_reconstruction
from .portfolio_reconstruction import PositionState

EPSILON = portfolio_reconstruction.EPSILON

TimeSeries = list[tuple[datetime, float]]


def _weekly_grid(start: datetime, end: datetime) -> list[datetime]:
    grid = []
    d = start
    while d <= end:
        grid.append(d)
        d += timedelta(weeks=1)
    if not grid or grid[-1] < end:
        grid.append(end)
    return grid


def _value_at(history: TimeSeries, date: datetime) -> float | None:
    """Dernière valeur connue à date <= `date`. `history` doit être trié par date
    croissante (contrat inchangé). Recherche dichotomique (cf. LOT 4.6) plutôt que
    parcours linéaire : cette fonction est appelée dans une boucle grille hebdomadaire
    x positions, un parcours O(n) à chaque appel rend le coût total quadratique en
    l'ancienneté du portefeuille. `bisect_right` sur les dates donne l'index du premier
    point strictement postérieur à `date` ; le point cherché est celui juste avant —
    strictement équivalent au parcours linéaire précédent, y compris pour des dates
    dupliquées dans `history` (on retient alors la dernière occurrence, comme le
    parcours qui ne s'arrêtait qu'au premier `d > date`)."""
    idx = bisect.bisect_right(history, date, key=lambda point: point[0])
    if idx == 0:
        return None
    return history[idx - 1][1]


def _history_to_series(hist: pd.DataFrame, fx_series: TimeSeries | None) -> TimeSeries:
    series: TimeSeries = []
    for idx, row in hist.iterrows():
        close = row.get("Close")
        if close is None or pd.isna(close):
            continue
        dt = idx.to_pydatetime().astimezone(timezone.utc).replace(tzinfo=None)
        prix = float(close)
        if fx_series is not None:
            rate = _value_at(fx_series, dt)
            if rate is None:
                continue
            prix *= rate
        series.append((dt, prix))
    return series


def _devise_historique_yfinance(ticker_yf: yf.Ticker) -> str | None:
    """Devise dans laquelle `ticker_yf.history()` renvoie ses prix. À ne JAMAIS
    confondre avec `MarketDataCache.devise` : depuis le passage du cours des ETF à
    justETF (2.4), ce champ vaut systématiquement "EUR" pour un fonds (devise de
    la cotation justETF), quelle que soit la devise réelle de cotation Yahoo
    Finance de l'historique sous-jacent (ex. `IWDA.L` cote en USD, `XSDR.L` en
    GBp) — l'utiliser ici ferait sauter à tort la conversion de change et
    fausserait tout l'historique de ce titre. Toujours redemandée directement à
    yfinance plutôt que déduite d'un champ désormais réutilisé à d'autres fins."""
    try:
        return ticker_yf.info.get("currency")
    except Exception:
        return None


def _fetch_fx_history(devise: str, start: datetime) -> TimeSeries:
    pence = devise in ("GBp", "GBX")
    code = "GBP" if pence else devise.upper()
    try:
        hist = yf.Ticker(f"{code}EUR=X").history(start=start.date().isoformat(), interval="1wk")
    except Exception:
        return []
    if hist is None or hist.empty:
        return []
    series = _history_to_series(hist, None)
    if pence:
        series = [(d, v / 100) for d, v in series]
    return series


def _serie_cumulee_ventes_et_revenus(db: Session, user_id: int) -> TimeSeries:
    """Somme cumulée, dans le temps, de tout ce que le graphique d'historique
    omettait jusqu'ici : le produit net de chaque vente (`TRADING/SELL`) et les
    revenus perçus (dividendes, intérêts, autres revenus). Même périmètre exact
    que `performance_service.compute_performance` (`gains_realises` — composante
    "produit de vente" — + `dividendes_percus` + `interets_percus` +
    `autres_revenus`), réutilisant `AUTRES_REVENUS_TYPES` de ce module pour ne
    jamais diverger silencieusement de sa définition. Construite directement
    depuis `Transaction` plutôt que via `PositionState` : les intérêts n'ont
    généralement pas de `symbol` et ne passent donc jamais par
    `portfolio_reconstruction` (dont la requête filtre `symbol IS NOT NULL`).

    `valeur_portefeuille - valeur_investie` (les deux champs historiques) ne
    couvrait donc que la valeur de marché des positions encore ouvertes moins le
    capital brut jamais décrémenté à la vente — en omettant entièrement ces
    montants. Ce cumul comble l'écart : `valeur_portefeuille +
    valeur_realisee_cumulee - valeur_investie` reconstitue exactement la même
    formule que `gain_perte_total`, terme à terme."""
    transactions = db.query(Transaction).filter(Transaction.user_id == user_id).order_by(Transaction.datetime_utc.asc()).all()

    series: TimeSeries = []
    cumule = 0.0
    for tx in transactions:
        if tx.category == "TRADING" and tx.type == "SELL" and tx.shares is not None:
            montant = tx.amount + tx.fee + tx.tax
        elif tx.category == "CASH" and tx.type == "DIVIDEND":
            montant = tx.amount + tx.fee + tx.tax
        elif tx.category == "CASH" and tx.type == "INTEREST_PAYMENT":
            montant = tx.amount + tx.fee + tx.tax
        elif tx.type in performance_service.AUTRES_REVENUS_TYPES:
            montant = tx.amount + tx.fee + tx.tax
        else:
            continue
        cumule += montant
        series.append((tx.datetime_utc, cumule))
    return series


def _valeur_positions_live(db: Session, user_id: int) -> float:
    """Valorisation « live » des positions financières ouvertes — exactement le
    même calcul que `valeur_positions` dans `performance_service.compute_performance`
    (`analysis_service.holdings_financiers` + `value_holdings`). Utilisée
    uniquement pour le DERNIER point de la grille hebdomadaire (aujourd'hui) : les
    points passés restent nécessairement valorisés au dernier cours hebdomadaire
    `yfinance` connu (pas d'historique de cours instantané disponible), mais le
    point d'aujourd'hui peut — et doit — coïncider exactement avec la carte
    Rentabilité globale plutôt que de rester approximatif de quelques euros."""
    holdings = analysis_service.holdings_financiers(db, user_id)
    valued = analysis_service.value_holdings(holdings)
    return sum(v.valeur for v in valued)


def compute_portfolio_history(db: Session, user_id: int, positions: dict[str, PositionState] | None = None) -> list[dict]:
    """Historique de valeur du portefeuille d'UN utilisateur (Milestone 2a, cf. LOT 4.5).

    Mis en cache (`historique_cache`, clé `cle_historique_portefeuille(user_id)` —
    scopée par utilisateur depuis Milestone 2a, sans quoi le premier utilisateur à
    calculer son historique verrait sa donnée servie à tous les autres tant que le
    cache est valide) : en cas de lecture à chaud, aucun accès au grand livre ni à
    `yfinance` n'a lieu, `positions` n'est alors même pas consulté. En cas de lecture
    à froid, `positions` — cf. LOT 4.3 — évite de rejouer le grand livre si l'appelant
    l'a déjà calculé ; recalculé sinon.
    """
    cle = historique_cache.cle_historique_portefeuille(user_id)
    en_cache = historique_cache.lire(db, cle)
    if en_cache is not None:
        return en_cache

    points = _compute_portfolio_history(
        db, user_id, positions if positions is not None else portfolio_reconstruction.compute_positions(db, user_id)
    )
    historique_cache.ecrire(db, cle, points)
    return points


def _compute_portfolio_history(db: Session, user_id: int, positions: dict[str, PositionState]) -> list[dict]:
    starts = [state.shares_history[0][0] for state in positions.values() if state.shares_history]
    if not starts:
        return []

    start = min(starts)
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    grid = _weekly_grid(start, now)

    holdings_by_ticker = {h.ticker: h for h in db.query(Holding).filter(Holding.user_id == user_id).all()}
    fx_cache: dict[str, TimeSeries] = {}
    price_series: dict[str, TimeSeries] = {}

    for symbol, state in positions.items():
        if not state.shares_history:
            continue
        ticker_resolu = market_data_service.resolve_ticker(db, symbol, state.asset_class)
        if ticker_resolu is None:
            continue
        try:
            ticker_yf = yf.Ticker(ticker_resolu)
            hist = ticker_yf.history(start=start.date().isoformat(), interval="1wk")
        except Exception:
            continue
        if hist is None or hist.empty:
            continue
        devise = _devise_historique_yfinance(ticker_yf)

        fx_series = None
        if devise and devise != "EUR":
            if devise not in fx_cache:
                fx_cache[devise] = _fetch_fx_history(devise, start)
            fx_series = fx_cache[devise]

        price_series[symbol] = _history_to_series(hist, fx_series)

    revenus_series = _serie_cumulee_ventes_et_revenus(db, user_id)

    points = []
    for date in grid:
        valeur_portefeuille = 0.0
        valeur_investie = 0.0
        for symbol, state in positions.items():
            valeur_investie += _value_at(state.invested_history, date) or 0.0

            shares_at = _value_at(state.shares_history, date) or 0.0
            if shares_at <= EPSILON:
                continue

            prix_at = _value_at(price_series.get(symbol, []), date)
            if prix_at is None:
                holding = holdings_by_ticker.get(symbol)
                prix_at = holding.prix_revient_moyen if holding else 0.0
            valeur_portefeuille += shares_at * (prix_at or 0.0)

        # Dernier point de la grille (toujours "aujourd'hui", cf. `_weekly_grid`) :
        # remplace le prix hebdomadaire — potentiellement vieux de quelques jours —
        # par la même valorisation « live » que la carte Rentabilité globale, pour
        # une coïncidence exacte plutôt qu'une approximation à quelques euros près.
        if date == grid[-1]:
            valeur_portefeuille = _valeur_positions_live(db, user_id)

        points.append(
            {
                "date": date.date().isoformat(),
                "valeur_portefeuille": round(valeur_portefeuille, 2),
                "valeur_investie": round(valeur_investie, 2),
                "valeur_realisee_cumulee": round(_value_at(revenus_series, date) or 0.0, 2),
            }
        )

    return points


# Indices de référence proposés pour la comparaison de performance (backlog 2.P.2) —
# ensemble volontairement restreint et choisi à l'avance (pas de ticker arbitraire
# saisi par l'utilisateur) : évite toute résolution/validation d'un identifiant
# quelconque, et garantit que chaque option a été vérifiée manuellement comme
# disponible sur `yfinance`. Tickers ETF/indice plutôt que "vrais" indices bruts
# quand plus fiables historiquement sur `yfinance` (ex. `URTH` réplique le MSCI World).
BENCHMARKS: dict[str, dict[str, str]] = {
    "MSCI_WORLD": {"label": "MSCI World", "ticker": "URTH"},
    "SP500": {"label": "S&P 500", "ticker": "^GSPC"},
    "CAC40": {"label": "CAC 40", "ticker": "^FCHI"},
    "STOXX600": {"label": "STOXX Europe 600", "ticker": "^STOXX"},
}


def _fetch_benchmark_series(ticker: str) -> TimeSeries:
    """Historique complet (`period="max"`) d'un indice de référence, mis en cache
    globalement (`historique_cache.cle_historique_benchmark`) — jamais recalculé par
    utilisateur ni par période demandée, cf. docstring de cette fonction de clé."""
    try:
        ticker_yf = yf.Ticker(ticker)
        hist = ticker_yf.history(period="max", interval="1wk")
    except Exception:
        return []
    if hist is None or hist.empty:
        return []
    devise = _devise_historique_yfinance(ticker_yf)
    first_date = hist.index[0].to_pydatetime().astimezone(timezone.utc).replace(tzinfo=None)
    fx_series = _fetch_fx_history(devise, first_date) if devise and devise != "EUR" else None
    return _history_to_series(hist, fx_series)


def compute_benchmark_history(db: Session, benchmark_key: str, points: list[dict]) -> dict | None:
    """Compare la performance du portefeuille à un indice de référence choisi par
    l'utilisateur (backlog 2.P.2), sur EXACTEMENT les mêmes dates que `points`
    (`compute_portfolio_history`, déjà calculé par l'appelant — pas de second calcul
    de grille ici). Les deux séries sont normalisées en pourcentage depuis leur
    valeur au premier point commun, pour rester comparables quelle que soit l'échelle
    (un portefeuille de quelques milliers d'euros contre un indice coté en points).

    `None` si `benchmark_key` est inconnu, si moins de 2 points sont fournis, ou si
    aucune donnée `yfinance` n'est disponible pour cet indice sur la période — jamais
    une exception propagée jusqu'au routeur."""
    benchmark = BENCHMARKS.get(benchmark_key)
    if benchmark is None or len(points) < 2:
        return None

    cle = historique_cache.cle_historique_benchmark(benchmark_key)
    en_cache = historique_cache.lire(db, cle)
    if en_cache is not None:
        serie = [(datetime.fromisoformat(d), p) for d, p in en_cache]
    else:
        serie = _fetch_benchmark_series(benchmark["ticker"])
        if not serie:
            return None
        historique_cache.ecrire(db, cle, [[d.isoformat(), p] for d, p in serie])

    dates = [datetime.fromisoformat(p["date"]) for p in points]
    prix_base = _value_at(serie, dates[0])
    if prix_base is None or prix_base == 0:
        return None

    valeur_base = points[0]["valeur_portefeuille"]
    comparaison = []
    for date, point in zip(dates, points):
        prix_at = _value_at(serie, date)
        benchmark_pct = round((prix_at / prix_base - 1) * 100, 2) if prix_at is not None else None
        portefeuille_pct = round((point["valeur_portefeuille"] / valeur_base - 1) * 100, 2) if valeur_base > 0 else None
        comparaison.append({"date": point["date"], "portefeuille_pct": portefeuille_pct, "benchmark_pct": benchmark_pct})

    return {"benchmark_key": benchmark_key, "label": benchmark["label"], "points": comparaison}


def compute_holding_price_history(db: Session, identifiant: str, user_id: int) -> dict | None:
    """Performance historique du titre/fonds lui-même (indépendante de la position de
    l'utilisateur) : série de prix + volatilité annualisée + max drawdown, calculées
    sur tout l'historique disponible via `yfinance`. Retourne `None` si le titre n'est
    pas résolu ou si aucune donnée n'est disponible (ex. private equity, obligation).

    `user_id` (Milestone 2a) : seulement pour vérifier que CE ticker fait bien partie
    du portefeuille de l'appelant (`_compute_holding_price_history`) — le résultat
    lui-même (prix, volatilité) reste une donnée de marché publique, partageable, mise
    en cache globalement comme avant (clé `cle_historique_ligne(identifiant)`, sans
    `user_id` : contrairement à l'historique du PORTEFEUILLE, l'historique d'un TICKER
    est objectivement le même pour tout le monde). Sans ça, chaque ouverture de la
    fiche détaillée retélécharge tout l'historique (`period="max"`), plusieurs
    secondes d'attente pour une série hebdomadaire. Un résultat `None` n'est
    volontairement pas mis en cache (ticker non résolu ou absence de donnée peuvent
    être transitoires ou corrigés par un rafraîchissement entre-temps ; ce n'est de
    toute façon jamais le chemin coûteux qu'on cherche à éviter, aucun appel
    `yfinance` ne s'est produit ou son résultat était vide)."""
    cle = historique_cache.cle_historique_ligne(identifiant)
    en_cache = historique_cache.lire(db, cle)
    if en_cache is not None:
        return en_cache

    resultat = _compute_holding_price_history(db, identifiant, user_id)
    if resultat is not None:
        historique_cache.ecrire(db, cle, resultat)
    return resultat


def _compute_holding_price_history(db: Session, identifiant: str, user_id: int) -> dict | None:
    holding = db.query(Holding).filter(Holding.ticker == identifiant, Holding.user_id == user_id).first()
    if holding is None:
        return None

    ticker_resolu = market_data_service.resolve_ticker(db, identifiant, holding.type_actif)
    if ticker_resolu is None:
        return None

    try:
        ticker_yf = yf.Ticker(ticker_resolu)
        hist = ticker_yf.history(period="max", interval="1wk")
    except Exception:
        return None
    if hist is None or hist.empty:
        return None

    devise = _devise_historique_yfinance(ticker_yf)
    first_date = hist.index[0].to_pydatetime().astimezone(timezone.utc).replace(tzinfo=None)
    fx_series = None
    if devise and devise != "EUR":
        fx_series = _fetch_fx_history(devise, first_date)

    series = _history_to_series(hist, fx_series)
    if len(series) < 2:
        return None

    prices = [p for _, p in series]
    returns = [(prices[i] / prices[i - 1] - 1) for i in range(1, len(prices)) if prices[i - 1] > 0]

    volatilite_annualisee_pct = None
    if len(returns) >= 2:
        mean = sum(returns) / len(returns)
        variance = sum((r - mean) ** 2 for r in returns) / (len(returns) - 1)
        volatilite_annualisee_pct = (variance**0.5) * (52**0.5) * 100

    peak = prices[0]
    max_drawdown = 0.0
    for p in prices:
        peak = max(peak, p)
        if peak > 0:
            max_drawdown = min(max_drawdown, (p - peak) / peak)

    return {
        "points": [{"date": d.date().isoformat(), "prix": round(p, 4)} for d, p in series],
        "volatilite_annualisee_pct": round(volatilite_annualisee_pct, 2) if volatilite_annualisee_pct is not None else None,
        "max_drawdown_pct": round(max_drawdown * 100, 2),
    }
