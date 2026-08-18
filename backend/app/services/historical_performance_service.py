"""Historique de la valeur du portefeuille dans le temps, pour le graphique
d'évolution du tableau de bord. Contrairement au reste de l'application (cours
instantanés via `.info`), ce module s'appuie sur `yfinance` `.history()` pour
récupérer des séries de prix hebdomadaires depuis la première transaction —
un appel par titre/devise, jamais un appel par date.
"""

from datetime import datetime, timedelta, timezone

import pandas as pd
import yfinance as yf
from sqlalchemy.orm import Session

from ..models import Holding
from . import market_data_service, portfolio_reconstruction

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
    """Dernière valeur connue à date <= `date`. `history` doit être trié par date croissante."""
    result = None
    for d, v in history:
        if d > date:
            break
        result = v
    return result


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


def compute_portfolio_history(db: Session) -> list[dict]:
    positions = portfolio_reconstruction.compute_positions(db)
    starts = [state.shares_history[0][0] for state in positions.values() if state.shares_history]
    if not starts:
        return []

    start = min(starts)
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    grid = _weekly_grid(start, now)

    holdings_by_ticker = {h.ticker: h for h in db.query(Holding).all()}
    fx_cache: dict[str, TimeSeries] = {}
    price_series: dict[str, TimeSeries] = {}

    for symbol, state in positions.items():
        if not state.shares_history:
            continue
        holding = holdings_by_ticker.get(symbol)
        devise = holding.market_data.devise if holding and holding.market_data else None

        ticker_resolu = market_data_service.resolve_ticker(db, symbol, state.asset_class)
        if ticker_resolu is None:
            continue
        try:
            hist = yf.Ticker(ticker_resolu).history(start=start.date().isoformat(), interval="1wk")
        except Exception:
            continue
        if hist is None or hist.empty:
            continue

        fx_series = None
        if devise and devise != "EUR":
            if devise not in fx_cache:
                fx_cache[devise] = _fetch_fx_history(devise, start)
            fx_series = fx_cache[devise]

        price_series[symbol] = _history_to_series(hist, fx_series)

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

        points.append(
            {
                "date": date.date().isoformat(),
                "valeur_portefeuille": round(valeur_portefeuille, 2),
                "valeur_investie": round(valeur_investie, 2),
            }
        )

    return points


def compute_holding_price_history(db: Session, identifiant: str) -> dict | None:
    """Performance historique du titre/fonds lui-même (indépendante de la position de
    l'utilisateur) : série de prix + volatilité annualisée + max drawdown, calculées
    sur tout l'historique disponible via `yfinance`. Retourne `None` si le titre n'est
    pas résolu ou si aucune donnée n'est disponible (ex. private equity, obligation)."""
    holding = db.query(Holding).filter(Holding.ticker == identifiant).first()
    if holding is None:
        return None

    ticker_resolu = market_data_service.resolve_ticker(db, identifiant, holding.type_actif)
    if ticker_resolu is None:
        return None

    try:
        hist = yf.Ticker(ticker_resolu).history(period="max", interval="1wk")
    except Exception:
        return None
    if hist is None or hist.empty:
        return None

    devise = holding.market_data.devise if holding.market_data else None
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
