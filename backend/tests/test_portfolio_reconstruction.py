"""Verrouille le comportement actuel de la reconstruction du portefeuille (méthode
du coût moyen pondéré) à partir du grand livre de transactions."""

from datetime import datetime

from app.models import Holding
from app.services.portfolio_reconstruction import EPSILON, compute_positions, rebuild_holdings

from .conftest import make_transaction


def test_achat_simple_quantite_et_cout_de_revient_avec_frais(db):
    make_transaction(
        db,
        symbol="AAA",
        category="TRADING",
        type="BUY",
        shares=10.0,
        amount=-1000.0,
        fee=5.0,
        tax=2.0,
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
        fee=5.0,
        tax=2.0,
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
