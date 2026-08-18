"""Verrouille :
- LOT 4.6 : `_value_at` (recherche dichotomique) reste strictement équivalent à
  l'ancien parcours linéaire, sur une série aléatoire à graine fixée, bornes
  incluses (avant le premier point, après le dernier, exactement sur un point) ;
- LOT 4.4/4.5 : `compute_holding_price_history`/`compute_portfolio_history` passent
  par le cache persistant `historique_cache` — lecture à froid (calcul, un appel
  yfinance), lecture à chaud (aucun appel yfinance), expiration au-delà de
  `DUREE_VALIDITE_HEURES`, invalidation après reconstruction du portefeuille.
"""

import random
from datetime import datetime, timedelta, timezone

import pandas as pd
import pytest
import yfinance as yf

from app.models import HistoriqueCache, Holding
from app.services import historical_performance_service, historique_cache, portfolio_reconstruction
from app.services.historical_performance_service import (
    _value_at,
    compute_holding_price_history,
    compute_portfolio_history,
)
from app.services.portfolio_reconstruction import rebuild_holdings

from .conftest import make_transaction

# ---------------------------------------------------------------------------
# 4.6 — recherche dichotomique de _value_at
# ---------------------------------------------------------------------------


def _value_at_naif(history, date):
    """Ancienne implémentation (parcours linéaire), gardée ici uniquement comme
    référence pour prouver l'équivalence stricte avec la nouvelle version dichotomique."""
    result = None
    for d, v in history:
        if d > date:
            break
        result = v
    return result


def test_value_at_dichotomique_identique_au_parcours_lineaire_sur_serie_aleatoire():
    alea = random.Random(20260818)
    depart = datetime(2015, 1, 5)

    history = []
    date_courante = depart
    for _ in range(500):
        date_courante += timedelta(days=alea.randint(1, 5))
        history.append((date_courante, alea.uniform(-1000.0, 1000.0)))
    fin = history[-1][0]

    dates_testees = [depart - timedelta(days=1), fin + timedelta(days=1)]  # avant le premier, après le dernier
    dates_testees.extend(d for d, _ in history)  # exactement sur chaque point de la série
    for _ in range(2000):
        offset = alea.randint(-10, (fin - depart).days + 10)
        dates_testees.append(depart + timedelta(days=offset))

    for date in dates_testees:
        attendu = _value_at_naif(history, date)
        obtenu = _value_at(history, date)
        assert obtenu == attendu, f"divergence pour {date} : attendu={attendu}, obtenu={obtenu}"


def test_value_at_dichotomique_gere_les_dates_dupliquees_comme_le_parcours_lineaire():
    """Sur des dates dupliquées, le parcours linéaire d'origine ne s'arrête qu'au
    premier point strictement postérieur : il retient donc la DERNIÈRE occurrence
    d'une date répétée. `bisect_right` doit se comporter de façon identique."""
    history = [
        (datetime(2024, 1, 1), 10.0),
        (datetime(2024, 1, 5), 20.0),
        (datetime(2024, 1, 5), 25.0),
        (datetime(2024, 1, 10), 30.0),
    ]

    assert _value_at(history, datetime(2024, 1, 5)) == _value_at_naif(history, datetime(2024, 1, 5)) == 25.0
    assert _value_at(history, datetime(2024, 1, 4)) == _value_at_naif(history, datetime(2024, 1, 4)) == 10.0


def test_value_at_bornes_serie_vide_et_extremites():
    assert _value_at([], datetime(2024, 1, 1)) is None

    history = [(datetime(2024, 1, 1), 1.0)]
    assert _value_at(history, datetime(2023, 12, 31)) is None  # avant le premier point
    assert _value_at(history, datetime(2024, 1, 1)) == 1.0  # exactement sur le point
    assert _value_at(history, datetime(2024, 6, 1)) == 1.0  # après le dernier point


# ---------------------------------------------------------------------------
# 4.4/4.5 — cache d'historique
# ---------------------------------------------------------------------------


class _FauxTickerAvecHistorique:
    """Double `yf.Ticker` qui répond avec une petite série hebdomadaire valide,
    quels que soient les arguments passés à `.history()` (période/dates/intervalle)."""

    def __init__(self, symbole=None, *args, **kwargs):
        self.symbole = symbole
        self.info: dict = {}
        self.funds_data = None

    def history(self, *args, **kwargs):
        dates = pd.DatetimeIndex([datetime(2024, 1, 1), datetime(2024, 1, 8), datetime(2024, 1, 15)])
        return pd.DataFrame({"Close": [100.0, 105.0, 110.0]}, index=dates)


class _FauxTickerQuiEchoue:
    """Double qui échoue à l'instanciation : prouve qu'aucun appel `yf.Ticker` n'a
    lieu (lecture à chaud, servie entièrement depuis le cache)."""

    def __init__(self, *args, **kwargs):
        raise AssertionError("yf.Ticker ne doit pas être appelé : la lecture doit venir du cache")


def test_holding_price_history_lecture_a_froid_puis_a_chaud_sans_appel_yfinance(db, monkeypatch):
    db.add(Holding(ticker="AAA", quantite=1.0, prix_revient_moyen=100.0, type_actif="STOCK"))
    db.commit()
    monkeypatch.setattr(historical_performance_service.market_data_service, "resolve_ticker", lambda *a, **k: "RESOLVED")
    monkeypatch.setattr(yf, "Ticker", _FauxTickerAvecHistorique)

    resultat_froid = compute_holding_price_history(db, "AAA")
    assert resultat_froid is not None
    assert len(resultat_froid["points"]) == 3

    # Lecture à chaud : le double lève désormais s'il est instancié -> preuve qu'aucun
    # appel yfinance n'a eu lieu, le résultat vient bien du cache.
    monkeypatch.setattr(yf, "Ticker", _FauxTickerQuiEchoue)
    resultat_chaud = compute_holding_price_history(db, "AAA")

    assert resultat_chaud == resultat_froid


def test_holding_price_history_expire_au_dela_de_24h(db, monkeypatch):
    db.add(Holding(ticker="AAA", quantite=1.0, prix_revient_moyen=100.0, type_actif="STOCK"))
    db.commit()
    monkeypatch.setattr(historical_performance_service.market_data_service, "resolve_ticker", lambda *a, **k: "RESOLVED")
    monkeypatch.setattr(yf, "Ticker", _FauxTickerAvecHistorique)

    compute_holding_price_history(db, "AAA")

    entree = db.get(HistoriqueCache, historique_cache.cle_historique_ligne("AAA"))
    entree.derniere_maj = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(
        hours=historique_cache.DUREE_VALIDITE_HEURES + 1
    )
    db.commit()

    appels = {"n": 0}

    class _FauxTickerCompte(_FauxTickerAvecHistorique):
        def history(self, *args, **kwargs):
            appels["n"] += 1
            return super().history(*args, **kwargs)

    monkeypatch.setattr(yf, "Ticker", _FauxTickerCompte)

    resultat = compute_holding_price_history(db, "AAA")
    assert resultat is not None
    assert appels["n"] == 1  # cache périmé : un nouvel appel yfinance a bien eu lieu


def test_portfolio_history_lecture_a_froid_puis_a_chaud_sans_appel_yfinance(db, monkeypatch):
    make_transaction(db, transaction_id="t1", symbol="AAA", shares=10.0, amount=-1000.0, datetime_utc=datetime(2024, 1, 1))
    rebuild_holdings(db)
    monkeypatch.setattr(historical_performance_service.market_data_service, "resolve_ticker", lambda *a, **k: "RESOLVED")
    monkeypatch.setattr(yf, "Ticker", _FauxTickerAvecHistorique)

    resultat_froid = compute_portfolio_history(db)
    assert resultat_froid  # au moins un point de la grille hebdomadaire

    monkeypatch.setattr(yf, "Ticker", _FauxTickerQuiEchoue)
    resultat_chaud = compute_portfolio_history(db)

    assert resultat_chaud == resultat_froid


def test_portfolio_history_invalide_apres_reconstruction_du_portefeuille(db, monkeypatch):
    make_transaction(db, transaction_id="t1", symbol="AAA", shares=10.0, amount=-1000.0, datetime_utc=datetime(2024, 1, 1))
    rebuild_holdings(db)
    monkeypatch.setattr(historical_performance_service.market_data_service, "resolve_ticker", lambda *a, **k: "RESOLVED")
    monkeypatch.setattr(yf, "Ticker", _FauxTickerAvecHistorique)

    compute_portfolio_history(db)
    assert historique_cache.lire(db, historique_cache.cle_historique_portefeuille()) is not None

    # Un nouvel import change le portefeuille : `rebuild_holdings` doit invalider le
    # cache d'historique existant (LOT 4.5), sans quoi le tableau de bord afficherait
    # une évolution périmée après un import de transactions.
    make_transaction(db, transaction_id="t2", symbol="BBB", shares=5.0, amount=-500.0, datetime_utc=datetime(2024, 2, 1))
    rebuild_holdings(db)

    assert historique_cache.lire(db, historique_cache.cle_historique_portefeuille()) is None
