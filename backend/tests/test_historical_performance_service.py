"""Verrouille :
- LOT 4.6 : `_value_at` (recherche dichotomique) reste strictement équivalent à
  l'ancien parcours linéaire, sur une série aléatoire à graine fixée, bornes
  incluses (avant le premier point, après le dernier, exactement sur un point) ;
- LOT 4.4/4.5 : `compute_holding_price_history`/`compute_portfolio_history` passent
  par le cache persistant `historique_cache` — lecture à froid (calcul, un appel
  yfinance), lecture à chaud (aucun appel yfinance), expiration au-delà de
  `DUREE_VALIDITE_HEURES`, invalidation après reconstruction du portefeuille ;
- Increment 13 : le « Gains » du graphique du tableau de bord (`valeur_portefeuille +
  valeur_realisee_cumulee - valeur_investie`) coïncide exactement avec `gain_perte_total`
  de `performance_service.compute_performance` — écart signalé le 20/08/2026 entre le
  graphique (omettait ventes/dividendes/intérêts) et la carte Rentabilité globale.
"""

import random
from datetime import datetime, timedelta, timezone

import pandas as pd
import pytest
import yfinance as yf

from app.models import HistoriqueCache, Holding, MarketDataCache
from app.services import historical_performance_service, historique_cache, performance_service
from app.services.historical_performance_service import (
    _devise_historique_yfinance,
    _value_at,
    compute_holding_price_history,
    compute_portfolio_history,
)
from app.services.portfolio_reconstruction import compute_positions, rebuild_holdings

from .conftest import ID_UTILISATEUR_TEST, make_transaction

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
    db.add(Holding(user_id=ID_UTILISATEUR_TEST, ticker="AAA", quantite=1.0, prix_revient_moyen=100.0, type_actif="STOCK"))
    db.commit()
    monkeypatch.setattr(historical_performance_service.market_data_service, "resolve_ticker", lambda *a, **k: "RESOLVED")
    monkeypatch.setattr(yf, "Ticker", _FauxTickerAvecHistorique)

    resultat_froid = compute_holding_price_history(db, "AAA", ID_UTILISATEUR_TEST)
    assert resultat_froid is not None
    assert len(resultat_froid["points"]) == 3

    # Lecture à chaud : le double lève désormais s'il est instancié -> preuve qu'aucun
    # appel yfinance n'a eu lieu, le résultat vient bien du cache.
    monkeypatch.setattr(yf, "Ticker", _FauxTickerQuiEchoue)
    resultat_chaud = compute_holding_price_history(db, "AAA", ID_UTILISATEUR_TEST)

    assert resultat_chaud == resultat_froid


def test_holding_price_history_expire_au_dela_de_24h(db, monkeypatch):
    db.add(Holding(user_id=ID_UTILISATEUR_TEST, ticker="AAA", quantite=1.0, prix_revient_moyen=100.0, type_actif="STOCK"))
    db.commit()
    monkeypatch.setattr(historical_performance_service.market_data_service, "resolve_ticker", lambda *a, **k: "RESOLVED")
    monkeypatch.setattr(yf, "Ticker", _FauxTickerAvecHistorique)

    compute_holding_price_history(db, "AAA", ID_UTILISATEUR_TEST)

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

    resultat = compute_holding_price_history(db, "AAA", ID_UTILISATEUR_TEST)
    assert resultat is not None
    assert appels["n"] == 1  # cache périmé : un nouvel appel yfinance a bien eu lieu


def test_portfolio_history_lecture_a_froid_puis_a_chaud_sans_appel_yfinance(db, monkeypatch):
    make_transaction(db, transaction_id="t1", symbol="AAA", shares=10.0, amount=-1000.0, datetime_utc=datetime(2024, 1, 1))
    rebuild_holdings(db, ID_UTILISATEUR_TEST)
    monkeypatch.setattr(historical_performance_service.market_data_service, "resolve_ticker", lambda *a, **k: "RESOLVED")
    monkeypatch.setattr(yf, "Ticker", _FauxTickerAvecHistorique)

    resultat_froid = compute_portfolio_history(db, ID_UTILISATEUR_TEST)
    assert resultat_froid  # au moins un point de la grille hebdomadaire

    monkeypatch.setattr(yf, "Ticker", _FauxTickerQuiEchoue)
    resultat_chaud = compute_portfolio_history(db, ID_UTILISATEUR_TEST)

    assert resultat_chaud == resultat_froid


class _FauxTickerAvecDeviseUSD(_FauxTickerAvecHistorique):
    """Simule un fonds dont l'historique yfinance est en USD (ex. `IWDA.L`, vérifié
    réel) alors que `MarketDataCache.devise` vaut "EUR" — c'est le cas de tout
    fonds dont le cours vient désormais de justETF (2.4) : `devise` y reflète la
    devise de la cotation justETF (toujours EUR, `currency=EUR` demandé
    explicitement à leur API), pas celle de l'historique yfinance sous-jacent."""

    def __init__(self, symbole=None, *args, **kwargs):
        super().__init__(symbole, *args, **kwargs)
        self.info = {"currency": "USD"}


def _faux_taux_change_fixe(devise, start):
    # Premier point volontairement bien avant la série OHLC simulée (2024-01-01) :
    # `_history_to_series` convertit chaque date OHLC via `.astimezone(timezone.utc)`,
    # qui interprète une date naïve comme heure LOCALE avant de la convertir — sur
    # une machine en avance sur UTC, un taux fixé pile au 1er janvier arriverait
    # après la conversion du premier point OHLC et le ferait ignorer (`rate=None`).
    return [(datetime(2023, 12, 1), 0.5), (datetime(2024, 1, 15), 0.5)]


# ---------------------------------------------------------------------------
# 2.4 (Increment 9) — régression du 19/08/2026 : la conversion de change de
# l'historique ne doit jamais dépendre de `MarketDataCache.devise`, devenu
# systématiquement "EUR" pour un fonds depuis le passage de son cours à
# justETF, alors que l'historique yfinance sous-jacent reste dans sa devise de
# cotation d'origine (USD, GBp...). Utiliser ce champ pour décider s'il faut
# convertir saute la conversion et fausse tout l'historique d'un fonds coté
# hors zone euro — reproduit et corrigé ici, verrouillé pour ne plus jamais
# se reproduire silencieusement.
# ---------------------------------------------------------------------------


def test_devise_historique_yfinance_lit_info_currency_pas_market_data_cache():
    class _Faux:
        info = {"currency": "USD"}

    assert _devise_historique_yfinance(_Faux()) == "USD"


def test_devise_historique_yfinance_renvoie_none_si_info_leve():
    class _FauxDefaillant:
        @property
        def info(self):
            raise Exception("panne réseau simulée")

    assert _devise_historique_yfinance(_FauxDefaillant()) is None


def test_portfolio_history_convertit_meme_si_market_data_cache_devise_vaut_eur(db, monkeypatch):
    """Un fonds dont `MarketDataCache.devise == "EUR"` (cotation justETF) mais dont
    l'historique yfinance est réellement en USD doit quand même être converti."""
    make_transaction(db, transaction_id="t1", symbol="AAA", shares=10.0, amount=-1000.0, datetime_utc=datetime(2024, 1, 1))
    rebuild_holdings(db, ID_UTILISATEUR_TEST)
    db.add(MarketDataCache(ticker="AAA", devise="EUR", prix_actuel=110.0))
    db.commit()

    monkeypatch.setattr(historical_performance_service.market_data_service, "resolve_ticker", lambda *a, **k: "RESOLVED")
    monkeypatch.setattr(yf, "Ticker", _FauxTickerAvecDeviseUSD)
    monkeypatch.setattr(historical_performance_service, "_fetch_fx_history", _faux_taux_change_fixe)

    resultat = compute_portfolio_history(db, ID_UTILISATEUR_TEST)

    # `resultat[-2]`, pas `resultat[-1]` : le tout dernier point de la grille est
    # "aujourd'hui", dont `valeur_portefeuille` est désormais recalculée avec la
    # valorisation live (`_valeur_positions_live`, increment 13) plutôt qu'avec la
    # série hebdomadaire ici testée — `resultat[-2]` reste, lui, un point
    # hebdomadaire ordinaire, non affecté par ce remplacement.
    # Dernier prix connu de la série simulée (110.0, en USD) x 10 parts x taux
    # simulé (0.5) = 550 €. Sans la conversion (bug reproduit), la valeur
    # afficherait 1100 (110 x 10, jamais convertie).
    avant_dernier_point = resultat[-2]
    assert avant_dernier_point["valeur_portefeuille"] == pytest.approx(550.0)


def test_holding_price_history_convertit_meme_si_market_data_cache_devise_vaut_eur(db, monkeypatch):
    """Même verrouillage côté fiche détaillée d'une position (`compute_holding_price_history`)."""
    db.add(Holding(user_id=ID_UTILISATEUR_TEST, ticker="AAA", quantite=1.0, prix_revient_moyen=100.0, type_actif="FUND"))
    db.add(MarketDataCache(ticker="AAA", devise="EUR", prix_actuel=110.0))
    db.commit()

    monkeypatch.setattr(historical_performance_service.market_data_service, "resolve_ticker", lambda *a, **k: "RESOLVED")
    monkeypatch.setattr(yf, "Ticker", _FauxTickerAvecDeviseUSD)
    monkeypatch.setattr(historical_performance_service, "_fetch_fx_history", _faux_taux_change_fixe)

    resultat = compute_holding_price_history(db, "AAA", ID_UTILISATEUR_TEST)

    assert resultat is not None
    # Série simulée 100/105/110 (USD) x taux simulé 0.5 = 50/52.5/55.
    prix = [p["prix"] for p in resultat["points"]]
    assert prix == pytest.approx([50.0, 52.5, 55.0])


def test_portfolio_history_invalide_apres_reconstruction_du_portefeuille(db, monkeypatch):
    make_transaction(db, transaction_id="t1", symbol="AAA", shares=10.0, amount=-1000.0, datetime_utc=datetime(2024, 1, 1))
    rebuild_holdings(db, ID_UTILISATEUR_TEST)
    monkeypatch.setattr(historical_performance_service.market_data_service, "resolve_ticker", lambda *a, **k: "RESOLVED")
    monkeypatch.setattr(yf, "Ticker", _FauxTickerAvecHistorique)

    compute_portfolio_history(db, ID_UTILISATEUR_TEST)
    assert historique_cache.lire(db, historique_cache.cle_historique_portefeuille(ID_UTILISATEUR_TEST)) is not None

    # Un nouvel import change le portefeuille : `rebuild_holdings` doit invalider le
    # cache d'historique existant (LOT 4.5), sans quoi le tableau de bord afficherait
    # une évolution périmée après un import de transactions.
    make_transaction(db, transaction_id="t2", symbol="BBB", shares=5.0, amount=-500.0, datetime_utc=datetime(2024, 2, 1))
    rebuild_holdings(db, ID_UTILISATEUR_TEST)

    assert historique_cache.lire(db, historique_cache.cle_historique_portefeuille(ID_UTILISATEUR_TEST)) is None


# ---------------------------------------------------------------------------
# Increment 13 — réconciliation avec `performance_service.compute_performance` :
# le graphique du tableau de bord omettait entièrement le produit des ventes,
# les dividendes et les intérêts (cf. `docs/BACKLOG.md`, écart signalé le
# 20/08/2026 entre le graphique et la carte Rentabilité globale).
# ---------------------------------------------------------------------------


def test_valeur_realisee_cumulee_saute_au_bon_montant_apres_une_vente_et_un_dividende(db):
    make_transaction(
        db, transaction_id="t1", symbol="AAA", shares=10.0, amount=-1000.0, datetime_utc=datetime(2024, 1, 1)
    )
    make_transaction(
        db,
        transaction_id="t2",
        symbol="AAA",
        category="TRADING",
        type="SELL",
        shares=-4.0,
        amount=600.0,
        datetime_utc=datetime(2024, 6, 1),
    )
    make_transaction(
        db,
        transaction_id="t3",
        symbol="AAA",
        category="CASH",
        type="DIVIDEND",
        shares=6.0,
        amount=20.0,
        datetime_utc=datetime(2024, 7, 1),
    )
    rebuild_holdings(db, ID_UTILISATEUR_TEST)

    resultat = compute_portfolio_history(db, ID_UTILISATEUR_TEST)

    # Avant la vente (mai 2024) : rien encore réalisé.
    avant_vente = next(p for p in resultat if p["date"] <= "2024-05-25")
    assert avant_vente["valeur_realisee_cumulee"] == pytest.approx(0.0)

    # Entre la vente et le dividende : seul le produit de la vente (600) est cumulé.
    entre_vente_et_dividende = next(p for p in resultat if "2024-06-08" <= p["date"] <= "2024-06-29")
    assert entre_vente_et_dividende["valeur_realisee_cumulee"] == pytest.approx(600.0)

    # Après le dividende : vente (600) + dividende (20) = 620.
    apres_dividende = next(p for p in resultat if p["date"] >= "2024-07-06")
    assert apres_dividende["valeur_realisee_cumulee"] == pytest.approx(620.0)


def test_le_gain_du_graphique_coincide_exactement_avec_gain_perte_total(db):
    """Verrou central de l'increment 13 : `valeur_portefeuille + valeur_realisee_cumulee
    - valeur_investie`, sur le DERNIER point du graphique, doit reconstituer exactement
    `performance_service.compute_performance(...)["gain_perte_total"]` — vente partielle
    (gain réalisé), dividende et intérêt inclus, pour couvrir toutes les composantes que
    l'ancien calcul du graphique omettait."""
    make_transaction(
        db, transaction_id="t1", symbol="AAA", shares=10.0, amount=-1000.0, datetime_utc=datetime(2024, 1, 1)
    )
    make_transaction(
        db,
        transaction_id="t2",
        symbol="AAA",
        category="TRADING",
        type="SELL",
        shares=-4.0,
        amount=600.0,
        datetime_utc=datetime(2024, 6, 1),
    )
    make_transaction(
        db,
        transaction_id="t3",
        symbol="AAA",
        category="CASH",
        type="DIVIDEND",
        shares=6.0,
        amount=20.0,
        datetime_utc=datetime(2024, 7, 1),
    )
    make_transaction(
        db,
        transaction_id="t4",
        symbol=None,
        category="CASH",
        type="INTEREST_PAYMENT",
        shares=None,
        amount=5.0,
        datetime_utc=datetime(2024, 8, 1),
    )
    rebuild_holdings(db, ID_UTILISATEUR_TEST)
    db.add(MarketDataCache(ticker="AAA", devise="EUR", prix_actuel=150.0))
    db.commit()

    positions = compute_positions(db, ID_UTILISATEUR_TEST)
    performance = performance_service.compute_performance(db, ID_UTILISATEUR_TEST, positions=positions)

    resultat = compute_portfolio_history(db, ID_UTILISATEUR_TEST, positions=positions)
    dernier_point = resultat[-1]

    gain_graphique = dernier_point["valeur_portefeuille"] + dernier_point["valeur_realisee_cumulee"] - dernier_point["valeur_investie"]
    assert gain_graphique == pytest.approx(performance["gain_perte_total"], abs=0.01)
    # Non-régression du scénario chiffré lui-même (cf. calcul détaillé dans le plan) :
    # gains_latents 300 + gains_realises 200 + dividende 20 + intérêt 5 = 525.
    assert performance["gain_perte_total"] == pytest.approx(525.0)


def test_la_reconciliation_tient_meme_avec_une_position_fermee_sans_vente(db):
    """Backlog 2.J.1 : la réconciliation increment 13 doit continuer de tenir une
    fois le Fix 2 en place (perte réalisée sur une opération sur titres qui retire
    des titres sans contrepartie), pas seulement dans l'abstrait algébrique du plan
    — même scénario que le test ci-dessus, plus une position BBB entièrement perdue
    (`WORTHLESS`)."""
    make_transaction(
        db, transaction_id="t1", symbol="AAA", shares=10.0, amount=-1000.0, datetime_utc=datetime(2024, 1, 1)
    )
    make_transaction(
        db,
        transaction_id="t2",
        symbol="AAA",
        category="TRADING",
        type="SELL",
        shares=-4.0,
        amount=600.0,
        datetime_utc=datetime(2024, 6, 1),
    )
    make_transaction(
        db,
        transaction_id="t3",
        symbol="AAA",
        category="CASH",
        type="DIVIDEND",
        shares=6.0,
        amount=20.0,
        datetime_utc=datetime(2024, 7, 1),
    )
    make_transaction(
        db,
        transaction_id="t4",
        symbol=None,
        category="CASH",
        type="INTEREST_PAYMENT",
        shares=None,
        amount=5.0,
        datetime_utc=datetime(2024, 8, 1),
    )
    make_transaction(db, transaction_id="t5", symbol="BBB", shares=5.0, amount=-50.0, datetime_utc=datetime(2025, 1, 1))
    make_transaction(
        db,
        transaction_id="t6",
        symbol="BBB",
        category="CORPORATE_ACTION",
        type="WORTHLESS",
        shares=-5.0,
        amount=0.0,
        datetime_utc=datetime(2025, 2, 1),
    )
    rebuild_holdings(db, ID_UTILISATEUR_TEST)
    db.add(MarketDataCache(ticker="AAA", devise="EUR", prix_actuel=150.0))
    db.commit()

    positions = compute_positions(db, ID_UTILISATEUR_TEST)
    performance = performance_service.compute_performance(db, ID_UTILISATEUR_TEST, positions=positions)

    resultat = compute_portfolio_history(db, ID_UTILISATEUR_TEST, positions=positions)
    dernier_point = resultat[-1]

    gain_graphique = dernier_point["valeur_portefeuille"] + dernier_point["valeur_realisee_cumulee"] - dernier_point["valeur_investie"]
    assert gain_graphique == pytest.approx(performance["gain_perte_total"], abs=0.01)
    # 525 (scénario AAA seul, cf. test précédent) - 50 (coût de BBB entièrement perdu) = 475.
    assert performance["gain_perte_total"] == pytest.approx(475.0)


def test_le_dernier_point_utilise_la_valorisation_live_pas_le_prix_hebdomadaire(db, monkeypatch):
    """Le dernier point de la grille (aujourd'hui) doit utiliser la même valorisation
    « live » que la carte Rentabilité globale, pas le dernier prix hebdomadaire simulé
    — même si les deux sources donnent des valeurs différentes, comme ici."""
    make_transaction(
        db, transaction_id="t1", symbol="AAA", shares=10.0, amount=-1000.0, datetime_utc=datetime(2024, 1, 1)
    )
    rebuild_holdings(db, ID_UTILISATEUR_TEST)
    db.add(MarketDataCache(ticker="AAA", devise="EUR", prix_actuel=999.0))  # valeur "live" volontairement très différente
    db.commit()

    monkeypatch.setattr(historical_performance_service.market_data_service, "resolve_ticker", lambda *a, **k: "RESOLVED")
    monkeypatch.setattr(yf, "Ticker", _FauxTickerAvecHistorique)  # dernier prix hebdomadaire simulé : 110.0

    resultat = compute_portfolio_history(db, ID_UTILISATEUR_TEST)
    dernier_point = resultat[-1]

    # 10 parts x 999.0 (live) = 9990, pas 10 x 110.0 (hebdomadaire) = 1100.
    assert dernier_point["valeur_portefeuille"] == pytest.approx(9990.0)


# ---------------------------------------------------------------------------
# 2.P.2 — comparaison à un indice de référence
# ---------------------------------------------------------------------------


def _points_portefeuille():
    return [
        {"date": "2024-01-01", "valeur_portefeuille": 1000.0, "valeur_investie": 1000.0, "valeur_realisee_cumulee": 0.0},
        {"date": "2024-01-08", "valeur_portefeuille": 1050.0, "valeur_investie": 1000.0, "valeur_realisee_cumulee": 0.0},
        {"date": "2024-01-15", "valeur_portefeuille": 1100.0, "valeur_investie": 1000.0, "valeur_realisee_cumulee": 0.0},
    ]


def test_benchmark_inconnu_renvoie_none(db):
    assert historical_performance_service.compute_benchmark_history(db, "PAS_UN_INDICE", _points_portefeuille()) is None


def test_benchmark_moins_de_deux_points_renvoie_none(db, monkeypatch):
    monkeypatch.setattr(yf, "Ticker", _FauxTickerAvecHistorique)
    assert historical_performance_service.compute_benchmark_history(db, "MSCI_WORLD", _points_portefeuille()[:1]) is None


def test_benchmark_calcule_le_rendement_relatif_au_premier_point(db, monkeypatch):
    # _FauxTickerAvecHistorique : 100.0 / 105.0 / 110.0 aux mêmes dates que _points_portefeuille().
    monkeypatch.setattr(yf, "Ticker", _FauxTickerAvecHistorique)

    resultat = historical_performance_service.compute_benchmark_history(db, "MSCI_WORLD", _points_portefeuille())

    assert resultat is not None
    assert resultat["label"] == "MSCI World"
    assert resultat["points"][0] == {"date": "2024-01-01", "portefeuille_pct": 0.0, "benchmark_pct": 0.0}
    assert resultat["points"][1]["portefeuille_pct"] == 5.0  # 1050/1000 - 1
    assert resultat["points"][1]["benchmark_pct"] == 5.0  # 105/100 - 1
    assert resultat["points"][2]["portefeuille_pct"] == 10.0
    assert resultat["points"][2]["benchmark_pct"] == 10.0


def test_benchmark_sans_donnee_yfinance_renvoie_none(db, monkeypatch):
    class _FauxTickerVide:
        def __init__(self, *a, **k):
            self.info = {}

        def history(self, *a, **k):
            return pd.DataFrame()

    monkeypatch.setattr(yf, "Ticker", _FauxTickerVide)

    assert historical_performance_service.compute_benchmark_history(db, "MSCI_WORLD", _points_portefeuille()) is None


def test_benchmark_deuxieme_appel_sert_du_cache_sans_rappeler_yfinance(db, monkeypatch):
    monkeypatch.setattr(yf, "Ticker", _FauxTickerAvecHistorique)
    premier = historical_performance_service.compute_benchmark_history(db, "MSCI_WORLD", _points_portefeuille())
    assert premier is not None

    monkeypatch.setattr(yf, "Ticker", _FauxTickerQuiEchoue)
    second = historical_performance_service.compute_benchmark_history(db, "MSCI_WORLD", _points_portefeuille())

    assert second == premier
