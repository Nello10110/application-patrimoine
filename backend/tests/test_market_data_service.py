"""Verrouille le comportement de `fetch_fund_composition` — en particulier la
normalisation des poids (1.6) et le repli sur le nom de l'indice quand Yahoo ne
fournit pas `top_holdings` (2.1) —, sans aucun appel réseau (double `yf.Ticker` posé
par `no_network_yfinance` dans `conftest.py`)."""

import pytest
import yfinance as yf

from app.models import SOURCE_COMPOSITION, SOURCE_INDICE
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


def test_fonds_sans_top_holdings_replie_sur_le_nom_de_lindice(monkeypatch):
    """Sur les données réelles, la majorité des ETF détenus n'ont pas de
    `top_holdings` renseigné par Yahoo (2.1) : sans repli, ils basculaient
    entièrement en "Non catégorisé". Un fonds dont le nom contient un indice
    reconnu (ici MSCI World) obtient désormais une répartition géographique
    de source "indice"."""

    class FauxTickerSansTopHoldings:
        def __init__(self, symbole, *args, **kwargs):
            self.symbole = symbole
            self.funds_data = FauxFundsData(sector_weightings={}, top_holdings=None)

    monkeypatch.setattr(yf, "Ticker", FauxTickerSansTopHoldings)

    geo_rows, sector_rows, top_holdings_detail = fetch_fund_composition(
        "FAKE.ETF", {}, nom_fonds="iShares Core MSCI World UCITS ETF"
    )

    assert geo_rows != []
    assert all(row["source"] == SOURCE_INDICE for row in geo_rows)
    assert sum(row["poids"] for row in geo_rows) == pytest.approx(1.0, abs=1e-9)
    assert top_holdings_detail == []


def test_fonds_avec_top_holdings_garde_la_source_composition(monkeypatch):
    """Quand Yahoo fournit `top_holdings`, la répartition géographique vient de la
    composition réelle du fonds — le repli sur le nom de l'indice ne doit pas
    s'appliquer, même si le nom du fonds contient par ailleurs un indice reconnu."""
    import pandas as pd

    class FauxTickerAvecTopHoldings:
        def __init__(self, symbole, *args, **kwargs):
            self.symbole = symbole
            if symbole == "FAKE.ETF":
                top_holdings = pd.DataFrame(
                    {"Holding Percent": [0.6, 0.4], "Name": ["Titre A", "Titre B"]},
                    index=["AAA", "BBB"],
                )
                self.funds_data = FauxFundsData(sector_weightings={}, top_holdings=top_holdings)
                self.info = {}
            else:
                self.funds_data = None
                self.info = {"country": "France", "sector": "Technology"}

    monkeypatch.setattr(yf, "Ticker", FauxTickerAvecTopHoldings)

    geo_rows, sector_rows, top_holdings_detail = fetch_fund_composition(
        "FAKE.ETF", {}, nom_fonds="iShares Core MSCI World UCITS ETF"
    )

    assert geo_rows != []
    assert all(row["source"] == SOURCE_COMPOSITION for row in geo_rows)
    assert len(top_holdings_detail) == 2


def test_fonds_ni_top_holdings_ni_indice_reconnu_naboutit_a_aucune_ligne(monkeypatch):
    class FauxTickerSansRien:
        def __init__(self, symbole, *args, **kwargs):
            self.symbole = symbole
            self.funds_data = FauxFundsData(sector_weightings={}, top_holdings=None)

    monkeypatch.setattr(yf, "Ticker", FauxTickerSansRien)

    geo_rows, sector_rows, top_holdings_detail = fetch_fund_composition(
        "FAKE.ETF", {}, nom_fonds="Obligation Trésor Français 2032"
    )

    assert geo_rows == []
    assert sector_rows == []
    assert top_holdings_detail == []
