"""Verrouille le comportement actuel du calcul de rentabilité : `xirr`,
`compute_holding_returns` et `compute_performance`."""

from datetime import datetime, timezone

import pytest

from app.models import Holding, MarketDataCache
from app.services import performance_service, portfolio_reconstruction
from app.services.performance_service import compute_holding_return, compute_holding_returns, compute_performance, xirr
from app.services.portfolio_reconstruction import rebuild_holdings

from .conftest import make_transaction


def test_xirr_doublement_en_un_an_environ_100_pourcent():
    flux = [(datetime(2023, 1, 1), -1000.0), (datetime(2024, 1, 1), 2000.0)]
    resultat = xirr(flux)
    assert resultat == pytest.approx(100.0, abs=0.5)


def test_xirr_none_si_moins_de_deux_flux():
    assert xirr([]) is None
    assert xirr([(datetime(2024, 1, 1), 100.0)]) is None


def test_xirr_none_si_tous_les_flux_ont_le_meme_signe():
    flux = [(datetime(2023, 1, 1), 100.0), (datetime(2024, 1, 1), 200.0)]
    assert xirr(flux) is None


def test_rendement_depuis_achat_prix_actuel_sur_prix_de_revient(db):
    db.add(Holding(ticker="XYZ", nom="Titre XYZ", quantite=10.0, prix_revient_moyen=100.0))
    db.add(
        MarketDataCache(
            ticker="XYZ",
            prix_actuel=120.0,
            derniere_maj=datetime.now(timezone.utc),
        )
    )
    db.commit()

    resultats = compute_holding_returns(db)

    assert resultats["XYZ"]["rendement_depuis_achat_pct"] == 20.0


def test_pas_de_rendement_annualise_sans_prix_de_marche_reel(db):
    # Position reconstruite (donc avec des flux de trésorerie réels)...
    make_transaction(db, symbol="ABC", shares=10.0, amount=-1000.0)
    rebuild_holdings(db)

    # ... mais sans aucune cotation en cache : la ligne est valorisée à son coût
    # (`a_des_donnees=False`), donc pas de XIRR affiché même si des flux existent.
    resultats = compute_holding_returns(db)

    assert resultats["ABC"]["rendement_annualise_pct"] is None


def test_rendement_depuis_achat_via_valeur_estimee_phase1(db):
    """Immobilier/SCPI/assurance-vie/PER (Phase 1 de `docs/ROADMAP.md`) : pas de
    `MarketDataCache`, mais `valeur_estimee` joue le rôle du prix actuel."""
    db.add(
        Holding(
            ticker="MAISON", nom="Résidence", quantite=1.0, prix_revient_moyen=200000.0, type_actif="REAL_ESTATE", valeur_estimee=230000.0
        )
    )
    db.commit()

    resultats = compute_holding_returns(db)

    assert resultats["MAISON"]["rendement_depuis_achat_pct"] == 15.0
    # Pas d'historique de transactions pour cette ligne : pas de XIRR possible.
    assert resultats["MAISON"]["rendement_annualise_pct"] is None


def test_compute_performance_exclut_le_patrimoine_valorise_manuellement(db):
    """Phase 1 de `docs/ROADMAP.md` : un bien immobilier n'a pas de coût de base
    dans `positions` (jamais issu du grand livre de transactions) — l'inclure dans
    `valeur_positions`/`gains_latents` gonflerait le gain latent de sa valeur
    entière. La carte Rentabilité (boursière pure, increment 5) doit l'ignorer."""
    make_transaction(db, symbol="ABC", shares=10.0, amount=-1000.0)
    rebuild_holdings(db)
    db.add(MarketDataCache(ticker="ABC", prix_actuel=150.0, derniere_maj=datetime.now(timezone.utc)))
    db.add(Holding(ticker="MAISON", quantite=1.0, prix_revient_moyen=200000.0, type_actif="REAL_ESTATE", valeur_estimee=250000.0))
    db.commit()

    resultat = compute_performance(db)

    # 10 * 150 = 1500 (ABC seul, la maison à 250000 € n'y figure pas).
    assert resultat["valeur_positions"] == 1500.0
    assert resultat["gains_latents"] == pytest.approx(500.0)  # 1500 - 1000 (coût de base d'ABC)


# --- 1.1 + 1.2 + 1.3 : arithmétique algébrique de compute_performance ------------


def test_scenario_complet_gain_perte_total_au_centime_pres(db):
    """Pièce maîtresse du lot : un scénario monté à la main mélangeant tous les
    types de flux, avec un calcul de référence fait à la main ci-dessous.

    - Achat de 10 titres à 100€ : amount=-1000, fee=-5, tax=-2 (frais/taxes = charges)
      → coût de revient = -(-1000 -5 -2) = 1007 → coût moyen/titre = 100.7
    - Vente de 4 titres à 150€ : amount=+600, fee=-3, tax=-1
      → produit net = 600 - 3 - 1 = 596
      → coût retiré = 100.7 * 4 = 402.8
      → gain réalisé = 596 - 402.8 = 193.2
      → coût de base restant (6 titres) = 1007 - 402.8 = 604.2
    - Prix de marché actuel = 110€ pour les 6 titres restants
      → valeur des positions = 660 → gains latents = 660 - 604.2 = 55.8
    - Dividende BRUT 50€, tax=-15 (30% de prélèvement) → net = 50 + 0 - 15 = 35
    - Intérêt BRUT 10€, tax=-3 → net = 10 - 3 = 7
    - BENEFITS_SAVEBACK amount=5 → 5
    - TAX_OPTIMIZATION amount=0, tax=+0.02 (REMBOURSEMENT, positif) → 0.02
      → autres_revenus = 5 + 0.02 = 5.02

    gain_perte_total = gains_latents + gains_realises + dividendes_percus
                        + interets_percus + autres_revenus
                      = 55.8 + 193.2 + 35 + 7 + 5.02 = 296.02

    frais_payes (informatif) = -(-5) + -(-3) = 8.0
    impots_preleves (informatif) = -(-2) + -(-1) + -(-15) + -(-3) + -(0.02) = 20.98
    Ni l'un ni l'autre n'entre dans gain_perte_total (déjà comptés dans les flux nets
    ci-dessus) : les resoustraire créerait un double comptage.
    """
    make_transaction(
        db,
        transaction_id="scn-1",
        symbol="SCN",
        category="TRADING",
        type="BUY",
        shares=10.0,
        amount=-1000.0,
        fee=-5.0,
        tax=-2.0,
        datetime_utc=datetime(2024, 1, 1),
    )
    make_transaction(
        db,
        transaction_id="scn-2",
        symbol="SCN",
        category="TRADING",
        type="SELL",
        shares=-4.0,
        amount=600.0,
        fee=-3.0,
        tax=-1.0,
        datetime_utc=datetime(2024, 2, 1),
    )
    make_transaction(
        db,
        transaction_id="scn-3",
        symbol="SCN",
        category="CASH",
        type="DIVIDEND",
        shares=6.0,
        amount=50.0,
        fee=0.0,
        tax=-15.0,
        datetime_utc=datetime(2024, 3, 1),
    )
    make_transaction(
        db,
        transaction_id="scn-4",
        symbol="SCN",
        category="CASH",
        type="INTEREST_PAYMENT",
        shares=None,
        amount=10.0,
        fee=0.0,
        tax=-3.0,
        datetime_utc=datetime(2024, 3, 2),
    )
    make_transaction(
        db,
        transaction_id="scn-5",
        symbol="SCN",
        category="CASH",
        type="BENEFITS_SAVEBACK",
        shares=None,
        amount=5.0,
        fee=0.0,
        tax=0.0,
        datetime_utc=datetime(2024, 3, 3),
    )
    make_transaction(
        db,
        transaction_id="scn-6",
        symbol="SCN",
        category="CASH",
        type="TAX_OPTIMIZATION",
        shares=None,
        amount=0.0,
        fee=0.0,
        tax=0.02,  # remboursement : tax positif
        datetime_utc=datetime(2024, 3, 4),
    )

    rebuild_holdings(db)
    db.add(
        MarketDataCache(
            ticker="SCN",
            prix_actuel=110.0,
            derniere_maj=datetime.now(timezone.utc),
        )
    )
    db.commit()

    resultat = compute_performance(db)

    assert resultat["gains_realises"] == pytest.approx(193.2, abs=0.005)
    assert resultat["gains_latents"] == pytest.approx(55.8, abs=0.005)
    assert resultat["dividendes_percus"] == pytest.approx(35.0, abs=0.005)
    assert resultat["interets_percus"] == pytest.approx(7.0, abs=0.005)
    assert resultat["autres_revenus"] == pytest.approx(5.02, abs=0.005)
    assert resultat["frais_payes"] == pytest.approx(8.0, abs=0.005)
    assert resultat["impots_preleves"] == pytest.approx(20.98, abs=0.005)
    assert resultat["gain_perte_total"] == pytest.approx(296.02, abs=0.005)
    assert resultat["cout_total_investi"] == pytest.approx(1007.0, abs=0.005)
    assert resultat["rendement_simple_pct"] == pytest.approx(29.4, abs=0.01)


def test_type_de_mouvement_inconnu_est_exclu_du_resultat(db):
    """Un type inconnu ne doit jamais entrer silencieusement dans le résultat via
    un `else` fourre-tout : il n'est ni un dividende, ni un intérêt, ni dans la
    liste explicite des "autres revenus"."""
    make_transaction(
        db,
        transaction_id="unk-1",
        symbol=None,
        category="CASH",
        type="TYPE_INCONNU",
        shares=None,
        amount=999.0,
        fee=0.0,
        tax=0.0,
        datetime_utc=datetime(2024, 1, 1),
    )

    resultat = compute_performance(db)

    assert resultat["dividendes_percus"] == 0.0
    assert resultat["interets_percus"] == 0.0
    assert resultat["autres_revenus"] == 0.0
    assert resultat["gain_perte_total"] == 0.0


def test_frais_et_impots_informatifs_sans_influence_sur_le_gain(db):
    """`frais_payes` et `impots_preleves` sont exposés à titre informatif mais
    n'influent jamais sur `gain_perte_total` (déjà comptés via les montants nets),
    sous peine de double comptage."""
    make_transaction(
        db,
        transaction_id="fi-1",
        symbol="FEE",
        category="TRADING",
        type="BUY",
        shares=1.0,
        amount=-100.0,
        fee=-10.0,
        tax=-5.0,
        datetime_utc=datetime(2024, 1, 1),
    )

    resultat = compute_performance(db)

    assert resultat["frais_payes"] == pytest.approx(10.0)
    assert resultat["impots_preleves"] == pytest.approx(5.0)
    # Aucun titre vendu, aucun revenu perçu : le gain/perte ne doit dépendre que
    # des gains latents/réalisés + revenus nets, jamais de frais_payes/impots_preleves.
    assert resultat["gain_perte_total"] == pytest.approx(resultat["gains_latents"] + resultat["gains_realises"])


# --- 1.5 : bornes et convergence du XIRR ------------------------------------------


def test_xirr_none_si_detention_inferieure_a_90_jours():
    flux = [(datetime(2024, 1, 1), -1000.0), (datetime(2024, 1, 31), 1100.0)]  # 30 jours
    assert xirr(flux) is None


def test_xirr_none_si_non_convergence(monkeypatch):
    """La bissection sur un intervalle où la VAN change de signe converge toujours en
    pratique : le garde-fou de non-convergence est une sécurité, pas un cas courant.
    On l'exerce en rendant la tolérance impossible à atteindre, ce qui prouve que le
    chemin `pas de convergence -> None` existe bel et bien."""
    monkeypatch.setattr(performance_service, "XIRR_TOLERANCE_ABSOLUE", -1.0)
    monkeypatch.setattr(performance_service, "XIRR_TOLERANCE_RELATIVE", -1.0)

    flux = [(datetime(2022, 1, 1), -1000.0), (datetime(2024, 1, 1), 2000.0)]
    assert xirr(flux) is None


def test_xirr_tolerance_relative_gros_portefeuille():
    """Régression : une tolérance ABSOLUE de 1e-6 sur la VAN devient inatteignable dès
    que les flux se comptent en millions (la précision du flottant plafonne au-dessus),
    et faisait disparaître le rendement annualisé sans raison. La tolérance étant
    relative à la taille des flux, un doublement en trois ans reste bien calculé."""
    flux = [(datetime(2020, 1, 1), -1e8), (datetime(2023, 1, 1), 2e8)]
    resultat = xirr(flux)
    assert resultat is not None
    assert resultat == pytest.approx(25.99, abs=0.1)


def test_xirr_none_si_rendement_aberrant():
    # Quasi-triplement en ~91 jours : taux annualisé aberrant (largement > 1000%).
    flux = [(datetime(2024, 1, 1), -1000.0), (datetime(2024, 4, 1), 3000.0)]
    assert xirr(flux) is None


def test_xirr_doublement_en_deux_ans_environ_41_4_pourcent():
    flux = [(datetime(2022, 1, 1), -1000.0), (datetime(2024, 1, 1), 2000.0)]
    resultat = xirr(flux)
    assert resultat == pytest.approx(41.42, abs=0.5)


# --- 4.2 : compute_holding_return (ciblé sur une seule ligne) --------------------


def test_compute_holding_return_identique_a_compute_holding_returns_sur_plusieurs_lignes(db):
    """Verrou de non-régression du LOT 4.2 : la variante ciblée sur un seul ticker doit
    renvoyer exactement les mêmes valeurs que la variante « tout le portefeuille »,
    sur un portefeuille à plusieurs lignes mêlant les cas (avec/sans cotation,
    avec/sans vente partielle)."""
    # AAA : achat + vente partielle + cotation actuelle -> rendement_depuis_achat et annualise.
    make_transaction(db, transaction_id="aaa-1", symbol="AAA", shares=10.0, amount=-1000.0, datetime_utc=datetime(2023, 1, 1))
    make_transaction(
        db, transaction_id="aaa-2", symbol="AAA", type="SELL", shares=-4.0, amount=600.0, datetime_utc=datetime(2023, 6, 1)
    )
    # BBB : achat seul, avec cotation -> rendement_depuis_achat et annualise.
    make_transaction(db, transaction_id="bbb-1", symbol="BBB", shares=5.0, amount=-500.0, datetime_utc=datetime(2023, 2, 1))
    # CCC : achat, sans cotation en cache -> ni depuis_achat ni annualise (valorisé au coût).
    make_transaction(db, transaction_id="ccc-1", symbol="CCC", shares=2.0, amount=-200.0, datetime_utc=datetime(2023, 3, 1))

    rebuild_holdings(db)
    db.add(MarketDataCache(ticker="AAA", prix_actuel=120.0, derniere_maj=datetime.now(timezone.utc)))
    db.add(MarketDataCache(ticker="BBB", prix_actuel=90.0, derniere_maj=datetime.now(timezone.utc)))
    db.commit()

    ensemble = compute_holding_returns(db)
    assert set(ensemble) == {"AAA", "BBB", "CCC"}

    for ticker in ensemble:
        assert compute_holding_return(db, ticker) == ensemble[ticker], f"divergence pour {ticker}"

    # Un ticker absent du portefeuille renvoie des valeurs nulles — même comportement
    # que `.get(ticker, {})` sur le résultat de `compute_holding_returns`, tel qu'utilisé
    # par les appelants (routeur/`holding_detail_service`).
    assert compute_holding_return(db, "INEXISTANT") == {
        "rendement_depuis_achat_pct": None,
        "rendement_annualise_pct": None,
    }


def test_compute_holding_return_ne_relit_pas_tout_le_grand_livre(db, monkeypatch):
    """`compute_holding_return` doit rester ciblé sur le ticker demandé (cf. LOT 4.2) :
    il ne doit jamais passer par `compute_positions`, qui rejoue tout le grand livre —
    c'était précisément le coût que ce lot élimine pour l'affichage d'une seule fiche."""
    make_transaction(db, transaction_id="t1", symbol="AAA", shares=1.0, amount=-100.0)
    make_transaction(db, transaction_id="t2", symbol="BBB", shares=1.0, amount=-100.0)
    rebuild_holdings(db)

    def _echoue(*args, **kwargs):
        raise AssertionError("compute_holding_return ne doit pas appeler compute_positions (tout le grand livre)")

    monkeypatch.setattr(portfolio_reconstruction, "compute_positions", _echoue)

    resultat = compute_holding_return(db, "AAA")
    assert resultat["rendement_depuis_achat_pct"] is None  # pas de cotation, mais pas d'exception non plus


# --- 4.3 : mémoïsation à portée de requête (paramètre explicite `positions`) -----


def test_positions_partagees_evite_un_recalcul_quand_plusieurs_fonctions_sont_enchainees(db, monkeypatch):
    """Démontre le mécanisme retenu pour le LOT 4.3 : un appelant qui a déjà calculé
    `positions` (typiquement via `compute_positions(db)`) peut le transmettre
    explicitement à `compute_performance` et `compute_holding_returns` plutôt que de
    laisser chacune le recalculer pour son propre compte — une seule reconstruction du
    grand livre au lieu d'une par fonction enchaînée, sans changer aucun résultat."""
    make_transaction(db, transaction_id="t1", symbol="AAA", shares=10.0, amount=-1000.0)
    rebuild_holdings(db)
    db.add(MarketDataCache(ticker="AAA", prix_actuel=120.0, derniere_maj=datetime.now(timezone.utc)))
    db.commit()

    compteur = {"n": 0}
    original = portfolio_reconstruction.compute_positions

    def _compte_et_calcule(db_):
        compteur["n"] += 1
        return original(db_)

    monkeypatch.setattr(portfolio_reconstruction, "compute_positions", _compte_et_calcule)

    positions = portfolio_reconstruction.compute_positions(db)  # calculé une fois par l'appelant
    resultat_perf = compute_performance(db, positions=positions)
    resultat_holdings = compute_holding_returns(db, positions=positions)

    assert compteur["n"] == 1  # les deux fonctions enchaînées ont réutilisé le même résultat

    # Sans le paramètre explicite, chaque fonction recalcule pour son propre compte —
    # et les résultats restent rigoureusement identiques (aucun changement de calcul).
    compteur["n"] = 0
    assert compute_performance(db) == resultat_perf
    assert compute_holding_returns(db) == resultat_holdings
    assert compteur["n"] == 2
