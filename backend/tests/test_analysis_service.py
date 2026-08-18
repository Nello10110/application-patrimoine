"""Verrouille le comportement actuel de la valorisation, de la répartition avec
look-through et des indicateurs de risque."""

from datetime import datetime, timezone

from app.models import FundComposition, Holding, MarketDataCache
from app.services.analysis_service import breakdown_with_lookthrough, compute_risk_indicators, value_holdings


def test_value_holdings_valorise_au_prix_de_marche(db):
    db.add(Holding(ticker="AAA", quantite=10.0, prix_revient_moyen=50.0))
    db.add(MarketDataCache(ticker="AAA", prix_actuel=80.0, derniere_maj=datetime.now(timezone.utc)))
    db.commit()

    holdings = db.query(Holding).all()
    valued = value_holdings(holdings)

    assert valued[0].valeur == 800.0
    assert valued[0].a_des_donnees is True


def test_value_holdings_repli_sur_cout_de_revient_sans_cotation(db):
    db.add(Holding(ticker="BBB", quantite=5.0, prix_revient_moyen=200.0))
    db.commit()

    holdings = db.query(Holding).all()
    valued = value_holdings(holdings)

    assert valued[0].valeur == 1000.0  # 5 * 200 (coût de revient, pas de cotation)
    assert valued[0].a_des_donnees is False


def test_breakdown_lookthrough_eclate_un_etf_sur_sa_composition(db):
    db.add(Holding(ticker="ETF1", quantite=1.0, prix_revient_moyen=1000.0))
    db.add(MarketDataCache(ticker="ETF1", prix_actuel=1000.0, derniere_maj=datetime.now(timezone.utc)))
    db.add(FundComposition(ticker="ETF1", type="geo", categorie="Europe", poids=0.6))
    db.add(FundComposition(ticker="ETF1", type="geo", categorie="Amérique du Nord", poids=0.4))
    db.commit()

    holdings = db.query(Holding).all()
    valued = value_holdings(holdings)
    totals = breakdown_with_lookthrough(db, valued, "geo")

    assert totals == {"Europe": 600.0, "Amérique du Nord": 400.0}


def test_breakdown_lookthrough_sans_composition_reste_sur_sa_propre_categorie(db):
    db.add(Holding(ticker="STOCK1", quantite=1.0, prix_revient_moyen=100.0))
    db.add(
        MarketDataCache(
            ticker="STOCK1",
            prix_actuel=100.0,
            region="Europe",
            derniere_maj=datetime.now(timezone.utc),
        )
    )
    db.commit()

    holdings = db.query(Holding).all()
    valued = value_holdings(holdings)
    totals = breakdown_with_lookthrough(db, valued, "geo")

    assert totals == {"Europe": 100.0}


def test_compute_risk_indicators_indice_herfindahl(db):
    db.add(Holding(ticker="A", quantite=1.0, prix_revient_moyen=600.0))
    db.add(Holding(ticker="B", quantite=1.0, prix_revient_moyen=400.0))
    db.commit()

    holdings = db.query(Holding).all()
    valued = value_holdings(holdings)  # pas de cotation -> repli sur coût de revient : 600 / 400
    indicateurs = compute_risk_indicators(valued, geo_totals={}, sector_totals={})

    # HHI = 0.6^2 + 0.4^2 = 0.52 -> score = (1 - 0.52) * 100 = 48.0
    assert indicateurs["score_diversification"] == 48.0
    assert indicateurs["top_ligne_poids"] == 60.0


def test_compute_risk_indicators_portefeuille_vide():
    indicateurs = compute_risk_indicators([], geo_totals={}, sector_totals={})

    assert indicateurs["valeur_totale"] == 0.0
    assert indicateurs["nombre_lignes"] == 0
    assert indicateurs["score_diversification"] == 0.0
