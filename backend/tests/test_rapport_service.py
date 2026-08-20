"""Verrouille `rapport_service.compute_rapport_mensuel` (roadmap Phase 4, § D.2) :
évolution de la valeur du portefeuille sur un mois, plus gros mouvements, dividendes
perçus. `historical_performance_service.compute_portfolio_history` est monkeypatché
pour isoler ces tests de tout appel réseau/cache — déjà verrouillé par ses propres
tests (`test_historical_performance_service.py`)."""

from app.services import historical_performance_service, rapport_service
from app.services.rapport_service import compute_rapport_mensuel

from .conftest import make_transaction


def _points(*paires: tuple[str, float]) -> list[dict]:
    return [{"date": d, "valeur_portefeuille": v, "valeur_investie": v} for d, v in paires]


def test_evolution_pct_entre_debut_et_fin_de_mois(db, monkeypatch):
    monkeypatch.setattr(
        historical_performance_service,
        "compute_portfolio_history",
        lambda db_: _points(("2026-06-28", 1000.0), ("2026-07-05", 1050.0), ("2026-07-26", 1100.0), ("2026-08-02", 1200.0)),
    )

    rapport = compute_rapport_mensuel(db, 2026, 7)

    assert rapport["valeur_debut_mois"] == 1000.0  # dernier point <= 2026-07-01
    assert rapport["valeur_fin_mois"] == 1100.0  # dernier point <= 2026-07-31
    assert rapport["evolution_pct"] == 10.0


def test_valeur_debut_replie_sur_le_tout_premier_point_si_anterieur_au_mois(db, monkeypatch):
    """Le portefeuille n'existait pas encore au 1er du mois demandé : pas de point
    avant cette date, repli sur le tout premier point disponible plutôt que `None`."""
    monkeypatch.setattr(
        historical_performance_service,
        "compute_portfolio_history",
        lambda db_: _points(("2026-07-15", 500.0), ("2026-07-31", 600.0)),
    )

    rapport = compute_rapport_mensuel(db, 2026, 7)

    assert rapport["valeur_debut_mois"] == 500.0
    assert rapport["valeur_fin_mois"] == 600.0


def test_aucun_point_valeurs_none(db, monkeypatch):
    monkeypatch.setattr(historical_performance_service, "compute_portfolio_history", lambda db_: [])

    rapport = compute_rapport_mensuel(db, 2026, 7)

    assert rapport["valeur_debut_mois"] is None
    assert rapport["valeur_fin_mois"] is None
    assert rapport["evolution_pct"] is None


def test_plus_gros_mouvements_tries_par_montant_absolu_limites_a_cinq(db, monkeypatch):
    monkeypatch.setattr(historical_performance_service, "compute_portfolio_history", lambda db_: [])

    for i, montant in enumerate([10.0, -500.0, 50.0, -20.0, 300.0, -5.0]):
        make_transaction(db, transaction_id=f"m{i}", symbol="AAA", amount=montant, date="2026-07-15")
    # Transaction hors du mois demandé : ne doit jamais apparaître.
    make_transaction(db, transaction_id="hors-mois", symbol="AAA", amount=-9999.0, date="2026-06-30")

    rapport = compute_rapport_mensuel(db, 2026, 7)

    montants = [m["montant"] for m in rapport["plus_gros_mouvements"]]
    assert montants == [-500.0, 300.0, 50.0, -20.0, 10.0]
    assert rapport["nombre_transactions"] == 6


def test_dividendes_percus_nets_sur_le_mois_seulement(db, monkeypatch):
    monkeypatch.setattr(historical_performance_service, "compute_portfolio_history", lambda db_: [])

    make_transaction(
        db, transaction_id="div1", category="CASH", type="DIVIDEND", asset_class=None,
        symbol="AAA", shares=None, price=None, amount=10.0, fee=0.0, tax=-1.5, date="2026-07-10",
    )
    make_transaction(
        db, transaction_id="div-hors-mois", category="CASH", type="DIVIDEND", asset_class=None,
        symbol="AAA", shares=None, price=None, amount=99.0, fee=0.0, tax=0.0, date="2026-08-01",
    )
    make_transaction(db, transaction_id="achat", symbol="AAA", amount=-100.0, date="2026-07-11")

    rapport = compute_rapport_mensuel(db, 2026, 7)

    assert rapport["dividendes_percus"] == 8.5
