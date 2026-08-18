"""Verrouille le comportement de `fetch_fund_composition` — en particulier la
normalisation des poids (1.6), sans aucun appel réseau (double `yf.Ticker` posé
par `no_network_yfinance` dans `conftest.py`)."""

import pytest
import yfinance as yf

from app.services.market_data_service import fetch_fund_composition


class FauxFundsData:
    """Double contrôlable pour `yf.Ticker(...).funds_data`."""

    def __init__(self, sector_weightings=None, top_holdings=None):
        self.sector_weightings = sector_weightings or {}
        self.top_holdings = top_holdings


def test_poids_sectoriels_normalises_a_1(monkeypatch):
    """Sur les données réelles, la somme des poids sectoriels Yahoo peut légèrement
    dépasser 1 (observé : 1,0001). Comme pour la répartition géographique, on
    renormalise pour que la somme des poids affichés vaille exactement 1,0."""

    class FauxTickerAvecFonds:
        def __init__(self, symbole, *args, **kwargs):
            self.symbole = symbole
            self.funds_data = FauxFundsData(
                sector_weightings={
                    "technology": 0.50,
                    "financial_services": 0.30,
                    "healthcare": 0.25,
                },
                top_holdings=None,
            )

    monkeypatch.setattr(yf, "Ticker", FauxTickerAvecFonds)

    geo_rows, sector_rows, top_holdings_detail = fetch_fund_composition("FAKE.ETF", {})

    total_poids = sum(row["poids"] for row in sector_rows)
    assert total_poids == pytest.approx(1.0, abs=1e-9)
    assert len(sector_rows) == 3
    assert top_holdings_detail == []
    assert geo_rows == []


def test_poids_sectoriels_vides_ne_plantent_pas(monkeypatch):
    class FauxTickerSansDonnees:
        def __init__(self, symbole, *args, **kwargs):
            self.symbole = symbole
            self.funds_data = FauxFundsData(sector_weightings={}, top_holdings=None)

    monkeypatch.setattr(yf, "Ticker", FauxTickerSansDonnees)

    geo_rows, sector_rows, top_holdings_detail = fetch_fund_composition("FAKE.ETF", {})

    assert sector_rows == []
