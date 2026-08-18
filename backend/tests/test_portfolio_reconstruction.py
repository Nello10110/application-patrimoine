"""Verrouille le comportement actuel de la reconstruction du portefeuille (méthode
du coût moyen pondéré) à partir du grand livre de transactions."""

import logging
from datetime import datetime

import pytest

from app.models import ORIGINE_MANUEL, ORIGINE_RECONSTRUIT, Holding
from app.services.portfolio_reconstruction import EPSILON, compute_positions, rebuild_holdings

from .conftest import make_holding, make_transaction


def test_achat_simple_quantite_et_cout_de_revient_avec_frais(db):
    # Convention réelle : fee/tax sont algébriques, négatifs pour une charge.
    make_transaction(
        db,
        symbol="AAA",
        category="TRADING",
        type="BUY",
        shares=10.0,
        amount=-1000.0,
        fee=-5.0,
        tax=-2.0,
    )

    positions = compute_positions(db)
    etat = positions["AAA"]

    assert etat.shares == 10.0
    assert etat.cost_basis == 1007.0  # 1000 + frais + taxe


def test_achat_simple_cree_une_ligne_de_portefeuille(db):
    make_transaction(
        db,
        symbol="AAA",
        shares=10.0,
        amount=-1000.0,
        fee=-5.0,
        tax=-2.0,
    )

    rebuild_holdings(db)

    holding = db.query(Holding).filter(Holding.ticker == "AAA").one()
    assert holding.quantite == 10.0
    assert holding.prix_revient_moyen == 100.7  # 1007 / 10


def test_achats_successifs_cout_moyen_pondere(db):
    make_transaction(db, transaction_id="tx-1", symbol="BBB", shares=10.0, amount=-1000.0, datetime_utc=datetime(2024, 1, 1))
    make_transaction(db, transaction_id="tx-2", symbol="BBB", shares=10.0, amount=-2000.0, datetime_utc=datetime(2024, 2, 1))

    etat = compute_positions(db)["BBB"]

    assert etat.shares == 20.0
    assert etat.cost_basis == 3000.0
    assert etat.cost_basis / etat.shares == 150.0  # coût moyen pondéré


def test_vente_partielle_cout_moyen_et_gain_realise(db):
    make_transaction(db, transaction_id="tx-1", symbol="CCC", shares=10.0, amount=-1000.0, datetime_utc=datetime(2024, 1, 1))
    make_transaction(db, transaction_id="tx-2", symbol="CCC", shares=10.0, amount=-2000.0, datetime_utc=datetime(2024, 2, 1))
    # Vente de 5 titres à 300€/titre (shares négatif : convention du courtier pour une vente).
    make_transaction(
        db,
        transaction_id="tx-3",
        symbol="CCC",
        type="SELL",
        shares=-5.0,
        amount=1500.0,
        datetime_utc=datetime(2024, 3, 1),
    )

    etat = compute_positions(db)["CCC"]

    # Coût moyen avant vente = 150€/titre ; coût retiré = 150 * 5 = 750.
    assert etat.shares == 15.0
    assert etat.cost_basis == 2250.0
    assert etat.realized_gain == 750.0  # 1500 - 750
    # Le coût moyen pondéré reste inchangé par une vente partielle.
    assert etat.cost_basis / etat.shares == 150.0


def test_position_retombee_a_zero_disparait_du_portefeuille(db):
    make_transaction(db, transaction_id="tx-1", symbol="DDD", shares=10.0, amount=-1000.0, datetime_utc=datetime(2024, 1, 1))
    make_transaction(
        db,
        transaction_id="tx-2",
        symbol="DDD",
        type="SELL",
        shares=-10.0,
        amount=1200.0,
        datetime_utc=datetime(2024, 2, 1),
    )

    etat = compute_positions(db)["DDD"]
    assert abs(etat.shares) < EPSILON

    rebuild_holdings(db)
    assert db.query(Holding).filter(Holding.ticker == "DDD").count() == 0


def test_dividende_ne_modifie_jamais_la_quantite(db):
    make_transaction(db, transaction_id="tx-1", symbol="EEE", shares=10.0, amount=-1000.0, datetime_utc=datetime(2024, 1, 1))
    # `shares` sur une ligne DIVIDEND est informatif (quantité détenue au détachement),
    # pas une acquisition : elle ne doit jamais être additionnée.
    make_transaction(
        db,
        transaction_id="tx-2",
        symbol="EEE",
        category="CASH",
        type="DIVIDEND",
        shares=10.0,
        amount=25.0,
        datetime_utc=datetime(2024, 2, 1),
    )

    etat = compute_positions(db)["EEE"]
    assert etat.shares == 10.0


def test_operation_sur_titre_ajuste_quantite_a_cout_nul(db):
    make_transaction(db, transaction_id="tx-1", symbol="FFF", shares=10.0, amount=-1000.0, datetime_utc=datetime(2024, 1, 1))
    cost_basis_avant = compute_positions(db)["FFF"].cost_basis

    # Action gratuite : ni TRADING/BUY-SELL, ni CASH/PRIVATE_MARKET_BUY, ni CASH/DIVIDEND.
    make_transaction(
        db,
        transaction_id="tx-2",
        symbol="FFF",
        category="CORPORATE_ACTION",
        type="FREE_RECEIPT",
        shares=5.0,
        amount=0.0,
        datetime_utc=datetime(2024, 2, 1),
    )

    etat = compute_positions(db)["FFF"]
    assert etat.shares == 15.0
    assert etat.cost_basis == cost_basis_avant  # coût nul pour l'opération sur titre


def test_private_market_buy_une_part_egale_un_euro_investi(db):
    make_transaction(
        db,
        symbol="GGG",
        category="CASH",
        type="PRIVATE_MARKET_BUY",
        shares=None,
        amount=-500.0,
    )

    etat = compute_positions(db)["GGG"]
    assert etat.shares == 500.0
    assert etat.cost_basis == 500.0


def test_private_market_buy_frais_integres_au_cout_mais_pas_a_la_quantite(db):
    """1.3 (suite) : les frais/taxes d'un PRIVATE_MARKET_BUY doivent alourdir le coût
    de revient, exactement comme un achat en bourse — mais la quantité de "parts"
    reste `-amount` (convention 1 part = 1€ BRUT investi, sans les frais)."""
    make_transaction(
        db,
        symbol="HHH",
        category="CASH",
        type="PRIVATE_MARKET_BUY",
        shares=None,
        amount=-500.0,
        fee=-10.0,
        tax=-1.0,
    )

    etat = compute_positions(db)["HHH"]
    assert etat.shares == 500.0  # quantité inchangée : -amount uniquement
    assert etat.cost_basis == 511.0  # 500 + 10 + 1 : coût de revient alourdi


def test_vente_sans_achat_correspondant_est_signalee_et_le_cout_reste_positif(db, caplog):
    """Grand livre réellement incomplet : plus de titres vendus qu'acquis, sans ligne
    d'achat tardive pour rétablir l'équilibre. La quantité résiduelle reste négative
    (elle est de toute façon écartée du portefeuille), mais le coût de base ne descend
    jamais sous zéro et l'anomalie est signalée à l'utilisateur."""
    make_transaction(db, transaction_id="tx-1", symbol="III", shares=10.0, amount=-1000.0, datetime_utc=datetime(2024, 1, 1))
    # Vente de 15 titres alors que seuls 10 sont détenus.
    make_transaction(
        db,
        transaction_id="tx-2",
        symbol="III",
        type="SELL",
        shares=-15.0,
        amount=1800.0,
        datetime_utc=datetime(2024, 2, 1),
    )

    with caplog.at_level(logging.WARNING, logger="outil_bourse.reconstruction"):
        etat = compute_positions(db)["III"]

    assert etat.cost_basis == pytest.approx(0.0, abs=1e-6)  # jamais négatif, borné à zéro
    assert len(etat.anomalies) == 1
    assert any(r.levelname == "WARNING" and "III" in r.getMessage() for r in caplog.records)

    # Une quantité négative n'apparaît jamais dans le portefeuille reconstruit.
    rebuild_holdings(db)
    assert db.query(Holding).filter(Holding.ticker == "III").count() == 0


def test_vente_horodatee_avant_son_achat_ne_cree_pas_de_position_fantome(db, caplog):
    """Cas réel constaté chez Trade Republic : un titre offert est vendu à 16h12 et la
    ligne d'achat correspondante n'est horodatée qu'à 16h20 le même jour. Borner la
    quantité à zéro dès la vente ferait apparaître, après l'achat tardif, une position
    que l'utilisateur ne détient pas. Le solde doit revenir exactement à zéro et aucune
    anomalie ne doit être signalée : le grand livre est complet, seul l'ordre diffère."""
    make_transaction(
        db,
        transaction_id="tx-vente",
        symbol="KKK",
        type="SELL",
        shares=-0.1111,
        amount=25.17,
        fee=-1.0,
        datetime_utc=datetime(2024, 3, 1, 16, 12),
    )
    make_transaction(
        db,
        transaction_id="tx-achat",
        symbol="KKK",
        type="BUY",
        shares=0.1111,
        amount=-25.16,
        datetime_utc=datetime(2024, 3, 1, 16, 20),
    )

    with caplog.at_level(logging.WARNING, logger="outil_bourse.reconstruction"):
        etat = compute_positions(db)["KKK"]

    assert etat.shares == pytest.approx(0.0, abs=1e-9)
    assert etat.anomalies == []
    assert not [r for r in caplog.records if r.levelname == "WARNING"]

    rebuild_holdings(db)
    assert db.query(Holding).filter(Holding.ticker == "KKK").count() == 0


def test_rebuild_holdings_remonte_le_nombre_d_anomalies(db):
    make_transaction(db, transaction_id="tx-1", symbol="JJJ", shares=10.0, amount=-1000.0, datetime_utc=datetime(2024, 1, 1))
    make_transaction(
        db,
        transaction_id="tx-2",
        symbol="JJJ",
        type="SELL",
        shares=-15.0,
        amount=1800.0,
        datetime_utc=datetime(2024, 2, 1),
    )

    resultat = rebuild_holdings(db)

    assert resultat.positions_recalculees == 0  # la position JJJ retombe à 0 -> disparaît du portefeuille
    assert resultat.anomalies_detectees == 1


def test_rebuild_holdings_zero_anomalie_cas_nominal(db):
    make_transaction(db, symbol="KKK", shares=10.0, amount=-1000.0)

    resultat = rebuild_holdings(db)

    assert resultat.positions_recalculees == 1
    assert resultat.anomalies_detectees == 0


# ---------------------------------------------------------------------------
# LOT 3.4 — arbitrage saisie manuelle / reconstruction automatique
# ---------------------------------------------------------------------------


def test_rebuild_holdings_preserve_une_ligne_manuelle_sans_ticker_correspondant(db):
    """Une ligne saisie à la main sur un ticker absent du grand livre survit à la
    reconstruction : seules les lignes `origine=ORIGINE_RECONSTRUIT` sont vidées."""
    make_holding(db, ticker="MANUEL_SEUL", quantite=3.0, origine=ORIGINE_MANUEL)
    make_transaction(db, symbol="AAA", shares=10.0, amount=-1000.0)

    resultat = rebuild_holdings(db)

    assert resultat.positions_recalculees == 1
    assert resultat.lignes_manuelles_remplacees == 0

    tickers = {h.ticker: h.origine for h in db.query(Holding).all()}
    assert tickers == {"MANUEL_SEUL": ORIGINE_MANUEL, "AAA": ORIGINE_RECONSTRUIT}


def test_rebuild_holdings_remplace_une_ligne_manuelle_avec_ticker_identique(db, caplog):
    """Si le grand livre reconstruit un ticker déjà présent en ligne manuelle, le
    grand livre fait foi : la ligne manuelle est supprimée (elle ferait doublon
    dans tous les calculs), l'événement journalisé en warning et compté."""
    make_holding(db, ticker="AAA", quantite=999.0, origine=ORIGINE_MANUEL)
    make_transaction(db, symbol="AAA", shares=10.0, amount=-1000.0)

    with caplog.at_level(logging.WARNING):
        resultat = rebuild_holdings(db)

    assert resultat.positions_recalculees == 1
    assert resultat.lignes_manuelles_remplacees == 1
    assert any("AAA" in r.message for r in caplog.records if r.levelname == "WARNING")

    lignes = db.query(Holding).filter(Holding.ticker == "AAA").all()
    assert len(lignes) == 1
    assert lignes[0].origine == ORIGINE_RECONSTRUIT
    assert lignes[0].quantite == 10.0  # la valeur reconstruite, pas la valeur manuelle (999.0)


def test_rebuild_holdings_ne_touche_pas_aux_autres_lignes_manuelles(db):
    """Deux lignes manuelles, une seule en conflit avec le grand livre : l'autre
    doit rester intouchée."""
    make_holding(db, ticker="AAA", quantite=999.0, origine=ORIGINE_MANUEL)
    make_holding(db, ticker="ZZZ", quantite=5.0, origine=ORIGINE_MANUEL)
    make_transaction(db, symbol="AAA", shares=10.0, amount=-1000.0)

    resultat = rebuild_holdings(db)

    assert resultat.lignes_manuelles_remplacees == 1
    ligne_zzz = db.query(Holding).filter(Holding.ticker == "ZZZ").one()
    assert ligne_zzz.origine == ORIGINE_MANUEL
    assert ligne_zzz.quantite == 5.0
