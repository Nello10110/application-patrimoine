"""Verrouille le comportement actuel de la valorisation, de la répartition avec
look-through et des indicateurs de risque."""

from datetime import datetime, timezone

from app.models import SOURCE_COMPOSITION, SOURCE_INDICE, FundComposition, Holding, MarketDataCache
from app.services import analysis_service
from app.services.analysis_service import breakdown_with_lookthrough, compute_data_quality, compute_risk_indicators, value_holdings
from app.services.reference_indices import NON_CATEGORISE


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


def test_compute_data_quality_melange_les_quatre_situations(db):
    """Portefeuille de 2000€ mêlant les quatre situations du LOT 2.1/2.3 :
    composition réelle (1000€, 50%), estimation par indice (500€, 25%), donnée
    absente/"Non catégorisé" (500€, 25%, dont 200€ également sans cotation)."""
    now = datetime.now(timezone.utc)

    # 1) Fonds dont la géographie vient de la composition réelle du fonds.
    db.add(Holding(ticker="ETF_COMPO", quantite=1.0, prix_revient_moyen=1000.0))
    db.add(MarketDataCache(ticker="ETF_COMPO", prix_actuel=1000.0, derniere_maj=now))
    db.add(FundComposition(ticker="ETF_COMPO", type="geo", categorie="Europe", poids=1.0, source=SOURCE_COMPOSITION))

    # 2) Fonds dont la géographie est estimée à partir du nom de l'indice suivi.
    db.add(Holding(ticker="ETF_INDICE", quantite=1.0, prix_revient_moyen=500.0))
    db.add(MarketDataCache(ticker="ETF_INDICE", prix_actuel=500.0, derniere_maj=now))
    db.add(
        FundComposition(
            ticker="ETF_INDICE", type="geo", categorie="Amérique du Nord", poids=1.0, source=SOURCE_INDICE
        )
    )

    # 3) Ligne cotée mais sans aucune donnée géographique (pays non renseigné par Yahoo).
    db.add(Holding(ticker="STOCK_SANS_PAYS", quantite=1.0, prix_revient_moyen=300.0))
    db.add(MarketDataCache(ticker="STOCK_SANS_PAYS", prix_actuel=300.0, region=None, derniere_maj=now))

    # 4) Ligne sans cotation (private equity/obligation) : valorisée à son coût de
    #    revient, ET sans donnée géographique.
    db.add(Holding(ticker="SANS_COTATION", quantite=1.0, prix_revient_moyen=200.0))

    db.commit()

    holdings = db.query(Holding).all()
    valued = value_holdings(holdings)
    qualite = compute_data_quality(db, valued)

    assert qualite["valeur_composition_reelle"] == 1000.0
    assert qualite["pct_composition_reelle"] == 50.0
    assert qualite["valeur_estimee_par_indice"] == 500.0
    assert qualite["pct_estimee_par_indice"] == 25.0
    assert qualite["valeur_non_categorisee"] == 500.0
    assert qualite["pct_non_categorisee"] == 25.0
    assert qualite["valeur_sans_cotation"] == 200.0
    assert qualite["pct_sans_cotation"] == 10.0


def test_compute_data_quality_portefeuille_vide(db):
    qualite = compute_data_quality(db, [])

    assert qualite["valeur_composition_reelle"] == 0.0
    assert qualite["pct_composition_reelle"] == 0.0
    assert qualite["valeur_sans_cotation"] == 0.0
    assert qualite["pct_sans_cotation"] == 0.0


def test_un_fonds_sans_composition_n_est_jamais_classe_sur_son_pays_de_domiciliation(db):
    """Le pays renvoyé par le fournisseur pour un ETF est son pays de domiciliation
    (Irlande, Luxembourg pour la quasi-totalité des ETF européens), pas celui de ses
    actifs. Sans composition ni indice reconnu, le fonds doit rester explicitement non
    catégorisé plutôt que d'être compté comme une exposition européenne."""
    db.add(Holding(ticker="ETF-IE", nom="ETF domicilié en Irlande", quantite=10.0, prix_revient_moyen=100.0, type_actif="FUND"))
    db.add(MarketDataCache(ticker="ETF-IE", prix_actuel=100.0, pays="Ireland", region="Europe"))
    db.commit()

    valued = analysis_service.value_holdings(db.query(Holding).all())
    totaux = analysis_service.breakdown_with_lookthrough(db, valued, "geo")

    assert totaux == {NON_CATEGORISE: 1000.0}

    qualite = analysis_service.compute_data_quality(db, valued)
    assert qualite["valeur_non_categorisee"] == 1000.0
    assert qualite["valeur_composition_reelle"] == 0.0


def test_une_action_reste_classee_sur_son_pays(db):
    """À l'inverse d'un fonds, le pays d'une action individuelle EST son exposition."""
    db.add(Holding(ticker="ACT-US", nom="Action américaine", quantite=10.0, prix_revient_moyen=100.0, type_actif="STOCK"))
    db.add(MarketDataCache(ticker="ACT-US", prix_actuel=100.0, pays="United States", region="Amérique du Nord"))
    db.commit()

    valued = analysis_service.value_holdings(db.query(Holding).all())
    assert analysis_service.breakdown_with_lookthrough(db, valued, "geo") == {"Amérique du Nord": 1000.0}
