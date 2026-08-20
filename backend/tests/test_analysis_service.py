"""Verrouille le comportement actuel de la valorisation, de la répartition avec
look-through et des indicateurs de risque."""

from datetime import datetime, timezone

from sqlalchemy import event

from app.models import SOURCE_COMPOSITION, SOURCE_INDICE, FundComposition, Holding, MarketDataCache
from app.services import analysis_service
from app.services.analysis_service import (
    breakdown_with_lookthrough,
    compute_cout_gestion_consolide,
    compute_data_quality,
    compute_risk_indicators,
    value_holdings,
)
from app.services.reference_indices import NON_CATEGORISE


# --- 4.1 : Holding.market_data chargé en un lot, pas en N+1 requêtes -------------


def test_market_data_charge_en_un_lot_pas_une_requete_par_ligne(db):
    """Verrou anti-régression du LOT 4.1 : sans stratégie de chargement explicite sur
    `Holding.market_data` (`lazy="selectin"`), SQLAlchemy émettrait une requête par
    ligne dès que `.market_data` est accédé dans `value_holdings` — 1 requête
    `holdings` + N requêtes `market_data_cache` pour N positions. On le prouve en
    comptant réellement les requêtes SQL émises (écouteur sur `before_cursor_execute`),
    seul moyen fiable de verrouiller durablement ce genre de correctif."""
    nombre_lignes = 20
    maintenant = datetime.now(timezone.utc)
    for i in range(nombre_lignes):
        ticker = f"MULTI{i}"
        db.add(Holding(ticker=ticker, quantite=1.0, prix_revient_moyen=10.0))
        db.add(MarketDataCache(ticker=ticker, prix_actuel=12.0, derniere_maj=maintenant))
    db.commit()
    db.expire_all()  # force un rechargement réel depuis la base, pas depuis l'identity map

    requetes = []

    def _compter(conn, cursor, statement, parameters, context, executemany):
        requetes.append(statement)

    moteur = db.get_bind()
    event.listen(moteur, "before_cursor_execute", _compter)
    try:
        holdings = db.query(Holding).all()
        valued = value_holdings(holdings)
    finally:
        event.remove(moteur, "before_cursor_execute", _compter)

    assert len(valued) == nombre_lignes
    # Sans le correctif : 1 (holdings) + `nombre_lignes` requêtes (une par `.market_data`)
    # = 21. Avec `lazy="selectin"` : 1 (holdings) + 1 (market_data_cache en un seul `IN`),
    # borné quel que soit `nombre_lignes` — donc très inférieur à 21 ici.
    assert len(requetes) <= 3


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


def test_value_holdings_valeur_estimee_prime_sur_prix_fois_quantite(db):
    """Phase 1 de `docs/ROADMAP.md` (immobilier/SCPI/assurance-vie/PER) : une
    `valeur_estimee` renseignée est un montant ABSOLU, prioritaire même si une
    `MarketDataCache` existait par ailleurs (cas normalement impossible pour ces
    types, mais la priorité doit être sans ambiguïté)."""
    db.add(Holding(ticker="MAISON", quantite=1.0, prix_revient_moyen=200000.0, type_actif="REAL_ESTATE", valeur_estimee=250000.0))
    db.add(MarketDataCache(ticker="MAISON", prix_actuel=1.0, derniere_maj=datetime.now(timezone.utc)))
    db.commit()

    valued = value_holdings(db.query(Holding).all())

    assert valued[0].valeur == 250000.0
    # Une estimation manuelle tenue à jour est une vraie donnée — à distinguer du
    # repli "valorisé au coût faute de cotation" (`a_des_donnees=False`).
    assert valued[0].a_des_donnees is True


def test_holdings_financiers_exclut_les_types_valorises_manuellement(db):
    db.add(Holding(ticker="AAA", quantite=1.0, prix_revient_moyen=100.0, type_actif="STOCK"))
    db.add(Holding(ticker="MAISON", quantite=1.0, prix_revient_moyen=200000.0, type_actif="REAL_ESTATE", valeur_estimee=250000.0))
    db.add(Holding(ticker="SANS_TYPE", quantite=1.0, prix_revient_moyen=50.0, type_actif=None))
    db.commit()

    financiers = analysis_service.holdings_financiers(db)
    tickers = {h.ticker for h in financiers}

    # AAA (type financier) et SANS_TYPE (type non renseigné, cas normal du
    # portefeuille financier existant) restent inclus ; MAISON est exclue.
    assert tickers == {"AAA", "SANS_TYPE"}


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


# ---------------------------------------------------------------------------
# Roadmap Phase 3, § E.3 — coût de gestion annuel consolidé des fonds/ETF
# ---------------------------------------------------------------------------


def test_cout_gestion_consolide_ignore_les_lignes_non_fonds(db):
    db.add(Holding(ticker="AAPL", quantite=10.0, prix_revient_moyen=100.0, type_actif="STOCK"))
    db.add(MarketDataCache(ticker="AAPL", prix_actuel=150.0, derniere_maj=datetime.now(timezone.utc)))
    db.commit()

    valued = value_holdings(db.query(Holding).all())
    resultat = compute_cout_gestion_consolide(valued)

    assert resultat == {
        "valeur_fonds": 0.0,
        "valeur_fonds_avec_ter_connu": 0.0,
        "couverture_pct": 0.0,
        "cout_annuel_estime": 0.0,
    }


def test_cout_gestion_consolide_calcule_le_cout_annuel_et_la_couverture(db):
    # ETF avec TER connu : 1000€ * 0,2% = 2€/an.
    db.add(Holding(ticker="ETF1", quantite=10.0, prix_revient_moyen=90.0, type_actif="FUND"))
    db.add(MarketDataCache(ticker="ETF1", prix_actuel=100.0, frais_gestion_pct=0.2, derniere_maj=datetime.now(timezone.utc)))
    # ETF sans TER connu (pas encore rafraîchi depuis la livraison de la fonctionnalité).
    db.add(Holding(ticker="ETF2", quantite=5.0, prix_revient_moyen=190.0, type_actif="FUND"))
    db.add(MarketDataCache(ticker="ETF2", prix_actuel=200.0, frais_gestion_pct=None, derniere_maj=datetime.now(timezone.utc)))
    db.commit()

    valued = value_holdings(db.query(Holding).all())
    resultat = compute_cout_gestion_consolide(valued)

    assert resultat["valeur_fonds"] == 2000.0  # 1000 (ETF1) + 1000 (ETF2)
    assert resultat["valeur_fonds_avec_ter_connu"] == 1000.0  # ETF1 seul
    assert resultat["couverture_pct"] == 50.0
    assert resultat["cout_annuel_estime"] == 2.0  # 1000 * 0.2 / 100


def test_cout_gestion_consolide_portefeuille_sans_fonds(db):
    assert compute_cout_gestion_consolide([]) == {
        "valeur_fonds": 0.0,
        "valeur_fonds_avec_ter_connu": 0.0,
        "couverture_pct": 0.0,
        "cout_annuel_estime": 0.0,
    }
