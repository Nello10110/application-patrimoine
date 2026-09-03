"""Verrouille le comportement de `fetch_fund_composition` — en particulier la
normalisation des poids (1.6) et le repli sur le nom de l'indice quand Yahoo ne
fournit pas `top_holdings` (2.1) —, sans aucun appel réseau (double `yf.Ticker` posé
par `no_network_yfinance` dans `conftest.py`). Verrouille aussi la limitation des
appels vers Yahoo Finance (LOT 7.5) : temporisation entre deux identifiants d'un
même rafraîchissement, et délai minimal entre deux rafraîchissements manuels."""

import pytest
import yfinance as yf

from app.models import SOURCE_COMPOSITION, SOURCE_INDICE, SOURCE_JUSTETF, FundComposition, FundTopHolding, MarketDataCache
from app.services import market_data_refresh, market_data_service
from app.services.market_data_service import fetch_fund_composition

from .conftest import attendre_fin_rafraichissement_arriere_plan, make_holding


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


# ---------------------------------------------------------------------------
# 7.5 — limitation des appels vers Yahoo Finance
# ---------------------------------------------------------------------------


def test_delai_entre_appels_neutralise_sous_test():
    """`backend/conftest.py` pose `PATRIMOINE_TESTING` avant tout import de
    l'application : le module doit avoir lu cette variable à l'import et neutralisé
    la temporisation, sans quoi toute la suite de tests serait ralentie."""
    assert market_data_service.DELAI_ENTRE_APPELS_SECONDES == 0.0


def test_refresh_tickers_temporise_entre_deux_identifiants(db, monkeypatch):
    appels_sleep = []
    monkeypatch.setattr(market_data_service, "DELAI_ENTRE_APPELS_SECONDES", 0.5)
    monkeypatch.setattr(market_data_service.time, "sleep", lambda s: appels_sleep.append(s))

    market_data_service.refresh_tickers(db, [("AAA", "STOCK"), ("BBB", "STOCK"), ("CCC", "STOCK")])

    # Une temporisation entre chaque paire d'identifiants consécutifs, jamais avant
    # le premier (rien à espacer avant qu'un premier appel n'ait eu lieu).
    assert appels_sleep == [0.5, 0.5]


def test_refresh_tickers_ne_temporise_pas_si_delai_nul(db, monkeypatch):
    appels_sleep = []
    monkeypatch.setattr(market_data_service, "DELAI_ENTRE_APPELS_SECONDES", 0.0)
    monkeypatch.setattr(market_data_service.time, "sleep", lambda s: appels_sleep.append(s))

    market_data_service.refresh_tickers(db, [("AAA", "STOCK"), ("BBB", "STOCK")])

    assert appels_sleep == []


def test_refresh_tickers_saute_le_patrimoine_valorise_manuellement(db, monkeypatch):
    """Phase 1 de `docs/ROADMAP.md` : immobilier/SCPI/assurance-vie/PER n'ont pas de
    ticker coté — ni `resolve_ticker` (yfinance) ni justETF ne doivent être sollicités,
    et aucune `MarketDataCache` ne doit être créée pour ces lignes."""
    appels_resolve = []
    monkeypatch.setattr(market_data_service, "resolve_ticker", lambda db, identifiant, asset_class: appels_resolve.append(identifiant) or None)

    resultats = market_data_service.refresh_tickers(
        db, [("MAISON", "REAL_ESTATE"), ("AV1", "LIFE_INSURANCE"), ("AAA", "STOCK")]
    )

    assert appels_resolve == ["AAA"]
    assert db.get(MarketDataCache, "MAISON") is None
    assert db.get(MarketDataCache, "AV1") is None
    # La ligne financière, elle, est bien traitée normalement.
    assert any(r.get("ticker") == "AAA" for r in resultats)


def test_refresh_manuel_second_appel_immediat_refuse_en_429(client, db):
    make_holding(db, ticker="AAA", quantite=1.0)

    premier = client.post("/api/market-data/refresh")
    assert premier.status_code == 202
    attendre_fin_rafraichissement_arriere_plan()

    second = client.post("/api/market-data/refresh")
    assert second.status_code == 429
    assert "patienter" in second.json()["detail"].lower()


def test_refresh_manuel_appel_unique_accepte(client, db):
    make_holding(db, ticker="AAA", quantite=1.0)

    reponse = client.post("/api/market-data/refresh")
    assert reponse.status_code == 202
    # 4B — la réponse est désormais l'état de démarrage du rafraîchissement en
    # tâche de fond, plus la liste complète du cache (le frontend rappelle de toute
    # façon `listHoldings()` juste après).
    corps = reponse.json()
    assert corps["en_cours"] is True
    assert corps["positions_total"] == 1


def test_refresh_manuel_delai_ecoule_de_nouveau_accepte(client, db, monkeypatch):
    """Passé le délai minimal, un nouveau rafraîchissement manuel est de nouveau
    accepté (pas de blocage permanent après le premier)."""
    from datetime import timedelta

    make_holding(db, ticker="AAA", quantite=1.0)

    premier = client.post("/api/market-data/refresh")
    assert premier.status_code == 202
    # Attend la fin effective du premier rafraîchissement avant d'en déclencher un
    # second : sans ça, le second pourrait essuyer un 409 (déjà en cours) au lieu du
    # 202 attendu ici, selon que le fil de fond a eu le temps de se terminer.
    attendre_fin_rafraichissement_arriere_plan()

    # Fait "avancer le temps" en reculant artificiellement la référence enregistrée,
    # plutôt que d'attendre réellement `DELAI_MINIMAL_ENTRE_RAFRAICHISSEMENTS_SECONDES`.
    monkeypatch.setattr(
        market_data_refresh,
        "_dernier_rafraichissement_manuel",
        market_data_refresh._dernier_rafraichissement_manuel
        - timedelta(seconds=market_data_refresh.DELAI_MINIMAL_ENTRE_RAFRAICHISSEMENTS_SECONDES + 1),
    )

    second = client.post("/api/market-data/refresh")
    assert second.status_code == 202


# ---------------------------------------------------------------------------
# 2.4 — une composition justETF déjà en base n'est jamais écrasée par ce
# rafraîchissement (cadence bien plus fréquente que le job justETF dédié)
# ---------------------------------------------------------------------------


def test_refresh_tickers_ne_recalcule_pas_si_composition_justetf_deja_presente(db, monkeypatch):
    """Une ligne `FundComposition` `source=SOURCE_JUSTETF` déjà en base pour un
    ticker doit rester intacte : `refresh_tickers` ne doit ni la supprimer, ni la
    dupliquer, ni la remplacer par un recalcul yfinance — même si yfinance
    produirait ici une composition différente."""
    make_holding(db, ticker="IE00JUSTETF", type_actif="FUND")
    db.add(FundComposition(ticker="IE00JUSTETF", type="geo", categorie="Europe", poids=1.0, source=SOURCE_JUSTETF))
    db.commit()

    class FauxTickerAvecCompositionDifferente:
        def __init__(self, symbole, *args, **kwargs):
            self.symbole = symbole
            self.info = {
                "regularMarketPrice": 100.0,
                "currency": "EUR",
                "country": "France",
                "sector": "Technology",
            }
            self.funds_data = FauxFundsData(sector_weightings={"technology": 1.0}, top_holdings=None)

    monkeypatch.setattr(yf, "Ticker", FauxTickerAvecCompositionDifferente)
    monkeypatch.setattr(market_data_service, "resolve_ticker", lambda db, identifiant, asset_class: "FAKE.ETF")

    market_data_service.refresh_tickers(db, [("IE00JUSTETF", "FUND")])

    lignes = db.query(FundComposition).filter(FundComposition.ticker == "IE00JUSTETF").all()
    assert len(lignes) == 1
    assert lignes[0].source == SOURCE_JUSTETF
    assert lignes[0].categorie == "Europe"


def test_refresh_tickers_preserve_fund_top_holding_si_composition_justetf(db, monkeypatch):
    """`FundTopHolding` (détail nominatif) est peuplé par le même bloc que
    `FundComposition` côté yfinance : sauter ce bloc pour un ticker géré par
    justETF ne doit pas non plus vider `FundTopHolding` sans jamais le
    reconstruire — la ligne déjà en base doit survivre à l'identique."""
    make_holding(db, ticker="IE00JUSTETF", type_actif="FUND")
    db.add(FundComposition(ticker="IE00JUSTETF", type="geo", categorie="Europe", poids=1.0, source=SOURCE_JUSTETF))
    db.add(FundTopHolding(ticker="IE00JUSTETF", holding_symbol="ASML.AS", holding_nom="ASML", poids=0.1))
    db.commit()

    class FauxTickerAvecCompositionDifferente:
        def __init__(self, symbole, *args, **kwargs):
            self.symbole = symbole
            self.info = {
                "regularMarketPrice": 100.0,
                "currency": "EUR",
                "country": "France",
                "sector": "Technology",
            }
            self.funds_data = FauxFundsData(sector_weightings={"technology": 1.0}, top_holdings=None)

    monkeypatch.setattr(yf, "Ticker", FauxTickerAvecCompositionDifferente)
    monkeypatch.setattr(market_data_service, "resolve_ticker", lambda db, identifiant, asset_class: "FAKE.ETF")

    market_data_service.refresh_tickers(db, [("IE00JUSTETF", "FUND")])

    lignes = db.query(FundTopHolding).filter(FundTopHolding.ticker == "IE00JUSTETF").all()
    assert len(lignes) == 1
    assert lignes[0].holding_symbol == "ASML.AS"


# ---------------------------------------------------------------------------
# 2.4 / Increment 9 — cours de référence des ETF via justETF (pas yfinance,
# sans repli en cas d'échec — décision utilisateur explicite)
# ---------------------------------------------------------------------------


def test_refresh_tickers_fund_utilise_justetf_pas_yfinance_pour_le_prix(db, monkeypatch):
    """Le prix de référence d'un ETF vient désormais de `justetf_service.fetch_price`
    (déjà en EUR) — `fetch_one` (yfinance) ne doit plus jamais être sollicité pour
    la cotation d'un `FUND`, même en cas de succès."""

    def _fetch_one_interdit(*args, **kwargs):
        raise AssertionError("fetch_one (yfinance) ne doit jamais être appelé pour un FUND")

    monkeypatch.setattr(market_data_service, "fetch_one", _fetch_one_interdit)
    monkeypatch.setattr(market_data_service.justetf_service, "fetch_price", lambda isin: {"prix_actuel": 127.09})

    resultats = market_data_service.refresh_tickers(db, [("IE00B4L5Y983", "FUND")])

    assert resultats == [{"ticker": "IE00B4L5Y983", "prix_actuel": pytest.approx(127.09), "devise": "EUR", "erreur": None}]
    cache = db.get(MarketDataCache, "IE00B4L5Y983")
    assert cache is not None
    assert cache.prix_actuel == pytest.approx(127.09)
    assert cache.devise == "EUR"
    assert cache.erreur is None


def test_refresh_tickers_fund_echec_justetf_aucun_repli_yfinance(db, monkeypatch):
    """Décision utilisateur explicite (2.4) : un échec justETF affiche « cotation
    indisponible », sans jamais retomber sur yfinance."""

    def _fetch_one_interdit(*args, **kwargs):
        raise AssertionError("fetch_one (yfinance) ne doit jamais être appelé, même après un échec justETF")

    monkeypatch.setattr(market_data_service, "fetch_one", _fetch_one_interdit)
    monkeypatch.setattr(market_data_service.justetf_service, "fetch_price", lambda isin: None)

    resultats = market_data_service.refresh_tickers(db, [("IE00B4L5Y983", "FUND")])

    assert resultats == [{"ticker": "IE00B4L5Y983", "erreur": "Cotation indisponible (justETF)"}]
    cache = db.get(MarketDataCache, "IE00B4L5Y983")
    assert cache is not None
    assert cache.erreur == "Cotation indisponible (justETF)"
    assert cache.prix_actuel is None


def test_refresh_tickers_stock_et_crypto_ignorent_justetf(db, monkeypatch):
    """Comportement `STOCK`/`CRYPTO` totalement inchangé : toujours `fetch_one`
    (yfinance), `justetf_service.fetch_price` jamais sollicité pour ces types."""

    def _fetch_price_interdit(*args, **kwargs):
        raise AssertionError("justetf_service.fetch_price ne doit être appelé que pour asset_class == 'FUND'")

    monkeypatch.setattr(market_data_service.justetf_service, "fetch_price", _fetch_price_interdit)

    resultats = market_data_service.refresh_tickers(db, [("AAPL", "STOCK"), ("BTC", "CRYPTO")])

    assert resultats == [
        {"ticker": "AAPL", "erreur": "Cotation indisponible (titre non coté ou non reconnu)"},
        {"ticker": "BTC", "erreur": "Cotation indisponible (titre non coté ou non reconnu)"},
    ]


def test_refresh_tickers_temporise_aussi_entre_deux_appels_justetf(db, monkeypatch):
    """Garde-fou de débit dédié (2.4) : `justetf_service.DELAI_ENTRE_APPELS_JUSTETF_SECONDES`,
    indépendant de `DELAI_ENTRE_APPELS_SECONDES` (yfinance) — jamais de temporisation
    avant le tout premier appel justETF, comme pour le garde-fou yfinance existant."""
    monkeypatch.setattr(market_data_service, "DELAI_ENTRE_APPELS_SECONDES", 0.0)
    monkeypatch.setattr(market_data_service.justetf_service, "DELAI_ENTRE_APPELS_JUSTETF_SECONDES", 3.0)
    monkeypatch.setattr(market_data_service.justetf_service, "fetch_price", lambda isin: None)

    appels_sleep = []
    monkeypatch.setattr(market_data_service.time, "sleep", lambda s: appels_sleep.append(s))

    market_data_service.refresh_tickers(db, [("AAA", "FUND"), ("BBB", "FUND"), ("CCC", "FUND")])

    assert appels_sleep == [3.0, 3.0]


# ---------------------------------------------------------------------------
# Roadmap Phase 3, § E.3 — coût de gestion consolidé : TER mis en cache une
# seule fois par ticker FUND, jamais recalculé aux rafraîchissements suivants.
# ---------------------------------------------------------------------------


def test_fetch_frais_gestion_lit_net_expense_ratio(monkeypatch):
    class FauxTickerAvecTer:
        def __init__(self, symbole, *args, **kwargs):
            self.info = {"netExpenseRatio": 0.2}

    monkeypatch.setattr(yf, "Ticker", FauxTickerAvecTer)

    assert market_data_service.fetch_frais_gestion("FAKE.ETF") == 0.2


def test_fetch_frais_gestion_none_si_absent_ou_erreur(monkeypatch):
    class FauxTickerSansInfo:
        def __init__(self, symbole, *args, **kwargs):
            self.info = {}

    monkeypatch.setattr(yf, "Ticker", FauxTickerSansInfo)
    assert market_data_service.fetch_frais_gestion("FAKE.ETF") is None

    def _leve(*args, **kwargs):
        raise ConnectionError("réseau indisponible")

    monkeypatch.setattr(yf, "Ticker", _leve)
    assert market_data_service.fetch_frais_gestion("FAKE.ETF") is None


def test_refresh_tickers_fund_met_en_cache_le_ter_au_premier_rafraichissement(db, monkeypatch):
    make_holding(db, ticker="IE00TER", type_actif="FUND")
    monkeypatch.setattr(market_data_service, "resolve_ticker", lambda db, identifiant, asset_class: "FAKE.ETF")
    monkeypatch.setattr(market_data_service.justetf_service, "fetch_price", lambda isin: {"prix_actuel": 100.0})
    monkeypatch.setattr(market_data_service, "fetch_frais_gestion", lambda ticker_resolu: 0.22)

    market_data_service.refresh_tickers(db, [("IE00TER", "FUND")])

    cache = db.get(MarketDataCache, "IE00TER")
    assert cache.frais_gestion_pct == 0.22


def test_refresh_tickers_fund_ne_recalcule_plus_le_ter_une_fois_connu(db, monkeypatch):
    """Une fois `frais_gestion_pct` renseigné, les rafraîchissements suivants ne
    doivent plus jamais rappeler `fetch_frais_gestion` — c'est tout le sens du
    cache « une seule fois par ticker » (§ E.3)."""
    make_holding(db, ticker="IE00TER", type_actif="FUND")
    db.add(MarketDataCache(ticker="IE00TER", frais_gestion_pct=0.10))
    db.commit()

    monkeypatch.setattr(market_data_service, "resolve_ticker", lambda db, identifiant, asset_class: "FAKE.ETF")
    monkeypatch.setattr(market_data_service.justetf_service, "fetch_price", lambda isin: {"prix_actuel": 100.0})

    def _interdit(*args, **kwargs):
        raise AssertionError("fetch_frais_gestion ne doit plus être appelé une fois le TER déjà connu")

    monkeypatch.setattr(market_data_service, "fetch_frais_gestion", _interdit)

    market_data_service.refresh_tickers(db, [("IE00TER", "FUND")])

    cache = db.get(MarketDataCache, "IE00TER")
    assert cache.frais_gestion_pct == 0.10  # inchangé


# --- Composition : justETF d'abord, yfinance en repli (03/09/2026) ---------------


def _fiche_justetf(geo=None, secteurs=None, top=None):
    from app.services.justetf_service import FicheJustETF

    return FicheJustETF(
        geo_rows=geo or [],
        sector_rows=secteurs or [],
        geo_brut=[],
        sector_brut=[],
        description=None,
        top_holdings=top or [],
    )


def test_un_etf_couvert_par_justetf_obtient_sa_repartition_geographique_des_le_premier_rafraichissement(db, monkeypatch):
    """Signalé le 03/09/2026 sur FR0011550185, un S&P 500 pourtant parfaitement
    couvert par justETF : après ajout, la répartition SECTORIELLE apparaissait —
    yfinance la fournit — mais pas la GÉOGRAPHIQUE, que yfinance ne donne pas pour
    beaucoup d'ETF européens. Elle n'arrivait qu'avec le job justETF, HEBDOMADAIRE :
    jusqu'à sept jours d'écran incomplet, sans que rien n'indique qu'il fallait
    attendre.

    L'ordre « justETF d'abord, yfinance en repli » était pourtant déjà documenté —
    il n'était appliqué qu'au prix, jamais à la composition."""
    from app.services import justetf_service

    make_holding(db, ticker="FR0011550185", type_actif="FUND")
    monkeypatch.setattr(justetf_service, "fetch_price", lambda isin: {"prix_actuel": 33.5, "devise": "EUR"})
    monkeypatch.setattr(
        justetf_service,
        "fetch_composition",
        lambda isin: _fiche_justetf(
            geo=[{"categorie": "Amérique du Nord", "poids": 0.97}, {"categorie": "Europe", "poids": 0.03}],
            secteurs=[{"categorie": "Technologies de l'information", "poids": 1.0}],
            top=[{"nom": "Apple", "poids": 0.07}],
        ),
    )

    market_data_service.refresh_tickers(db, [("FR0011550185", "FUND")])

    zones = db.query(FundComposition).filter(FundComposition.ticker == "FR0011550185", FundComposition.type == "geo").all()
    assert [z.categorie for z in zones] == ["Amérique du Nord", "Europe"]
    assert {z.source for z in zones} == {SOURCE_JUSTETF}
    # Le top 10 nominatif suit le même chemin.
    assert db.query(FundTopHolding).filter(FundTopHolding.ticker == "FR0011550185").count() == 1


def test_un_etf_non_couvert_par_justetf_retombe_sur_yfinance(db, monkeypatch):
    """L'autre moitié du contrat, et la plus facile à casser en corrigeant la
    première : justETF ne couvre pas tout (ETF obligataires, matières premières,
    ETC) et rend alors des listes vides. Sans ce test, un correctif qui ferait
    confiance à justETF sans vérifier priverait ces ETF de TOUTE composition."""
    from app.services import justetf_service

    make_holding(db, ticker="LU0000000000", type_actif="FUND")
    monkeypatch.setattr(justetf_service, "fetch_price", lambda isin: {"prix_actuel": 10.0, "devise": "EUR"})
    # Couverture absente : fiche vide sur les deux axes de composition.
    monkeypatch.setattr(justetf_service, "fetch_composition", lambda isin: _fiche_justetf())
    monkeypatch.setattr(market_data_service, "resolve_ticker", lambda db_, isin, ac: "XXX.PA")
    monkeypatch.setattr(
        market_data_service,
        "fetch_fund_composition",
        lambda ticker, cache, nom=None: ([], [{"categorie": "Finance", "poids": 1.0, "source": SOURCE_COMPOSITION}], []),
    )

    market_data_service.refresh_tickers(db, [("LU0000000000", "FUND")])

    lignes = db.query(FundComposition).filter(FundComposition.ticker == "LU0000000000").all()
    assert [l.categorie for l in lignes] == ["Finance"]
    assert {l.source for l in lignes} == {SOURCE_COMPOSITION}


def test_justetf_injoignable_ne_prive_pas_l_etf_de_composition(db, monkeypatch):
    """`fetch_composition` rend `None` sur échec réseau ou parsing. Le repli doit
    jouer là aussi, sinon une indisponibilité passagère de justETF viderait la
    composition de tous les ETF au prochain rafraîchissement de prix."""
    from app.services import justetf_service

    make_holding(db, ticker="LU1111111111", type_actif="FUND")
    monkeypatch.setattr(justetf_service, "fetch_price", lambda isin: {"prix_actuel": 10.0, "devise": "EUR"})
    monkeypatch.setattr(justetf_service, "fetch_composition", lambda isin: None)
    monkeypatch.setattr(market_data_service, "resolve_ticker", lambda db_, isin, ac: "YYY.PA")
    monkeypatch.setattr(
        market_data_service,
        "fetch_fund_composition",
        lambda ticker, cache, nom=None: ([{"categorie": "Europe", "poids": 1.0, "source": SOURCE_INDICE}], [], []),
    )

    market_data_service.refresh_tickers(db, [("LU1111111111", "FUND")])

    lignes = db.query(FundComposition).filter(FundComposition.ticker == "LU1111111111").all()
    assert [l.categorie for l in lignes] == ["Europe"]
