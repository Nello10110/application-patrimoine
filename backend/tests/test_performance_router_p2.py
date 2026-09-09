"""Verrouille les 3 nouvelles routes de `routers/performance.py` (backlog 2.P.2) :
`GET /api/performance/metriques-avancees`, `GET /api/performance/benchmarks`,
`GET /api/performance/comparaison-benchmark`."""

from datetime import datetime

import yfinance as yf

from app.services import historical_performance_service

from .conftest import ID_UTILISATEUR_TEST, make_transaction
from .test_historical_performance_service import _FauxTickerAvecHistorique
from app.services.portfolio_reconstruction import rebuild_holdings


def test_metriques_avancees_sans_historique(client):
    reponse = client.get("/api/performance/metriques-avancees")

    assert reponse.status_code == 200
    assert reponse.json() == {
        "twr_cumule_pct": None,
        "twr_annualise_pct": None,
        "volatilite_annualisee_pct": None,
        "max_drawdown_pct": None,
        "drawdown_recupere": None,
        "semaines_recuperation": None,
    }


def test_metriques_avancees_avec_historique(client, db, monkeypatch):
    make_transaction(db, transaction_id="t1", symbol="AAA", shares=10.0, amount=-1000.0, datetime_utc=datetime(2024, 1, 1))
    rebuild_holdings(db, ID_UTILISATEUR_TEST)
    monkeypatch.setattr(historical_performance_service.market_data_service, "resolve_ticker", lambda *a, **k: "RESOLVED")
    monkeypatch.setattr(yf, "Ticker", _FauxTickerAvecHistorique)

    reponse = client.get("/api/performance/metriques-avancees")

    assert reponse.status_code == 200
    assert reponse.json()["twr_cumule_pct"] is not None


def test_metriques_avancees_lentille_invalide_est_rejetee(client):
    reponse = client.get("/api/performance/metriques-avancees?lentille=inconnue")

    assert reponse.status_code == 400


def test_metriques_avancees_lentille_brut_utilise_le_patrimoine_combine_pas_seulement_financier(client, db):
    """Retour utilisateur du 09/09/2026 : « la vue Financier ne change pas ce
    graphique » — un bien immobilier (sans aucune transaction financière) ne doit
    apparaître qu'en lentille "brut"/"net", jamais en "financier" (comportement par
    défaut, inchangé)."""
    client.post("/api/portfolio/holdings", json={"ticker": "MAISON", "quantite": 1, "type_actif": "REAL_ESTATE", "valeur_estimee": 200000})

    reponse_financier = client.get("/api/performance/metriques-avancees")
    reponse_brut = client.get("/api/performance/metriques-avancees?lentille=brut")

    assert reponse_financier.status_code == 200
    assert reponse_financier.json()["twr_cumule_pct"] is None  # aucune position financière suivie
    assert reponse_brut.status_code == 200
    assert reponse_brut.json()["twr_cumule_pct"] is not None  # le bien immobilier, lui, est vu


def test_comparaison_benchmark_lentille_invalide_est_rejetee(client):
    reponse = client.get("/api/performance/comparaison-benchmark?benchmark=MSCI_WORLD&lentille=inconnue")

    assert reponse.status_code == 400


def test_comparaison_benchmark_lentille_brut_voit_le_patrimoine_combine(client, db, monkeypatch):
    monkeypatch.setattr(yf, "Ticker", _FauxTickerAvecHistorique)
    client.post("/api/portfolio/holdings", json={"ticker": "MAISON", "quantite": 1, "type_actif": "REAL_ESTATE", "valeur_estimee": 200000})

    # Sans aucune position financière, la lentille par défaut n'a pas assez de
    # points pour comparer à un indice.
    assert client.get("/api/performance/comparaison-benchmark?benchmark=MSCI_WORLD").status_code == 404

    reponse_brut = client.get("/api/performance/comparaison-benchmark?benchmark=MSCI_WORLD&lentille=brut")
    assert reponse_brut.status_code == 200
    assert len(reponse_brut.json()["points"]) > 0


def test_list_benchmarks(client):
    reponse = client.get("/api/performance/benchmarks")

    assert reponse.status_code == 200
    corps = reponse.json()
    assert {"key": "MSCI_WORLD", "label": "MSCI World"} in corps
    assert len(corps) == len(historical_performance_service.BENCHMARKS)


def test_comparaison_benchmark_inconnu_404(client):
    reponse = client.get("/api/performance/comparaison-benchmark?benchmark=PAS_UN_INDICE")

    assert reponse.status_code == 404


def test_comparaison_benchmark_sans_historique_404(client):
    # Pas assez de points (aucune transaction) : même comportement 404 qu'un
    # indice inconnu, message générique — cf. `compute_benchmark_history`.
    reponse = client.get("/api/performance/comparaison-benchmark?benchmark=MSCI_WORLD")

    assert reponse.status_code == 404


def test_comparaison_benchmark_avec_historique(client, db, monkeypatch):
    make_transaction(db, transaction_id="t1", symbol="AAA", shares=10.0, amount=-1000.0, datetime_utc=datetime(2024, 1, 1))
    rebuild_holdings(db, ID_UTILISATEUR_TEST)
    monkeypatch.setattr(historical_performance_service.market_data_service, "resolve_ticker", lambda *a, **k: "RESOLVED")
    monkeypatch.setattr(yf, "Ticker", _FauxTickerAvecHistorique)

    reponse = client.get("/api/performance/comparaison-benchmark?benchmark=MSCI_WORLD")

    assert reponse.status_code == 200
    corps = reponse.json()
    assert corps["benchmark_key"] == "MSCI_WORLD"
    assert len(corps["points"]) > 0
