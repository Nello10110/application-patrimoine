"""Verrouille `rapport_service.compute_rapport_periode` (roadmap Phase 4, § D.2 —
étendu à l'annuel et aux périodes personnalisées) : évolution de la valeur du
portefeuille sur une période, plus gros mouvements, dividendes perçus.
`historical_performance_service.compute_portfolio_history` est monkeypatché pour
isoler ces tests de tout appel réseau/cache — déjà verrouillé par ses propres tests
(`test_historical_performance_service.py`)."""

from app.services import historical_performance_service
from app.services.rapport_service import compute_rapport_periode

from .conftest import ID_UTILISATEUR_TEST, make_transaction


def _points(*paires: tuple[str, float], realise: dict[str, float] | None = None) -> list[dict]:
    """`realise` : valeur cumulée de `valeur_realisee_cumulee` par date, pour les tests
    qui vérifient la décomposition investi/généré — `0.0` par défaut (aucune vente/
    dividende/intérêt dans le scénario), comportement inchangé pour les tests
    existants qui ne s'y intéressent pas."""
    realise = realise or {}
    return [{"date": d, "valeur_portefeuille": v, "valeur_investie": v, "valeur_realisee_cumulee": realise.get(d, 0.0)} for d, v in paires]


def test_evolution_pct_entre_debut_et_fin_de_periode(db, monkeypatch):
    monkeypatch.setattr(
        historical_performance_service,
        "compute_portfolio_history",
        lambda db_, user_id_: _points(("2026-06-28", 1000.0), ("2026-07-05", 1050.0), ("2026-07-26", 1100.0), ("2026-08-02", 1200.0)),
    )

    rapport = compute_rapport_periode(db, "2026-07-01", "2026-07-31", ID_UTILISATEUR_TEST)

    assert rapport["valeur_debut_periode"] == 1000.0  # dernier point <= 2026-07-01
    assert rapport["valeur_fin_periode"] == 1100.0  # dernier point <= 2026-07-31
    assert rapport["evolution_pct"] == 10.0
    assert rapport["date_debut"] == "2026-07-01"
    assert rapport["date_fin"] == "2026-07-31"


def test_valeur_debut_replie_sur_le_tout_premier_point_si_anterieur_a_la_periode(db, monkeypatch):
    """Le portefeuille n'existait pas encore au début de la période demandée : pas de
    point avant cette date, repli sur le tout premier point disponible plutôt que `None`."""
    monkeypatch.setattr(
        historical_performance_service,
        "compute_portfolio_history",
        lambda db_, user_id_: _points(("2026-07-15", 500.0), ("2026-07-31", 600.0)),
    )

    rapport = compute_rapport_periode(db, "2026-07-01", "2026-07-31", ID_UTILISATEUR_TEST)

    assert rapport["valeur_debut_periode"] == 500.0
    assert rapport["valeur_fin_periode"] == 600.0


def test_aucun_point_valeurs_none(db, monkeypatch):
    monkeypatch.setattr(historical_performance_service, "compute_portfolio_history", lambda db_, user_id_: [])

    rapport = compute_rapport_periode(db, "2026-07-01", "2026-07-31", ID_UTILISATEUR_TEST)

    assert rapport["valeur_debut_periode"] is None
    assert rapport["valeur_fin_periode"] is None
    assert rapport["evolution_pct"] is None


def test_plus_gros_mouvements_tries_par_montant_absolu_limites_a_cinq(db, monkeypatch):
    monkeypatch.setattr(historical_performance_service, "compute_portfolio_history", lambda db_, user_id_: [])

    for i, montant in enumerate([10.0, -500.0, 50.0, -20.0, 300.0, -5.0]):
        make_transaction(db, transaction_id=f"m{i}", symbol="AAA", amount=montant, date="2026-07-15")
    # Transaction hors de la période demandée : ne doit jamais apparaître.
    make_transaction(db, transaction_id="hors-periode", symbol="AAA", amount=-9999.0, date="2026-06-30")

    rapport = compute_rapport_periode(db, "2026-07-01", "2026-07-31", ID_UTILISATEUR_TEST)

    montants = [m["montant"] for m in rapport["plus_gros_mouvements"]]
    assert montants == [-500.0, 300.0, 50.0, -20.0, 10.0]
    assert rapport["nombre_transactions"] == 6


def test_dividendes_percus_nets_sur_la_periode_seulement(db, monkeypatch):
    monkeypatch.setattr(historical_performance_service, "compute_portfolio_history", lambda db_, user_id_: [])

    make_transaction(
        db, transaction_id="div1", category="CASH", type="DIVIDEND", asset_class=None,
        symbol="AAA", shares=None, price=None, amount=10.0, fee=0.0, tax=-1.5, date="2026-07-10",
    )
    make_transaction(
        db, transaction_id="div-hors-periode", category="CASH", type="DIVIDEND", asset_class=None,
        symbol="AAA", shares=None, price=None, amount=99.0, fee=0.0, tax=0.0, date="2026-08-01",
    )
    make_transaction(db, transaction_id="achat", symbol="AAA", amount=-100.0, date="2026-07-11")

    rapport = compute_rapport_periode(db, "2026-07-01", "2026-07-31", ID_UTILISATEUR_TEST)

    assert rapport["dividendes_percus"] == 8.5


def test_periode_annuelle_couvre_toute_lannee(db, monkeypatch):
    """Le rapport annuel n'est qu'un appel avec des bornes plus larges (1er janvier
    au 31 décembre) — même moteur, aucune logique dédiée à vérifier séparément."""
    monkeypatch.setattr(
        historical_performance_service,
        "compute_portfolio_history",
        lambda db_, user_id_: _points(("2025-12-15", 900.0), ("2026-06-01", 1100.0), ("2026-12-31", 1300.0)),
    )
    make_transaction(db, transaction_id="jan", symbol="AAA", amount=-50.0, date="2026-01-05")
    make_transaction(db, transaction_id="dec", symbol="AAA", amount=-60.0, date="2026-12-20")
    make_transaction(db, transaction_id="hors-annee", symbol="AAA", amount=-9999.0, date="2025-12-31")

    rapport = compute_rapport_periode(db, "2026-01-01", "2026-12-31", ID_UTILISATEUR_TEST)

    assert rapport["valeur_debut_periode"] == 900.0
    assert rapport["valeur_fin_periode"] == 1300.0
    assert rapport["nombre_transactions"] == 2


def test_periode_personnalisee_arbitraire(db, monkeypatch):
    """Une période personnalisée (bornes quelconques, pas alignées sur un mois ou une
    année) suit exactement la même logique — rien de spécifique au calendrier."""
    monkeypatch.setattr(
        historical_performance_service,
        "compute_portfolio_history",
        lambda db_, user_id_: _points(("2026-03-10", 500.0), ("2026-04-10", 700.0)),
    )
    make_transaction(db, transaction_id="dans-periode", symbol="AAA", amount=-30.0, date="2026-04-01")
    make_transaction(db, transaction_id="avant-periode", symbol="AAA", amount=-9999.0, date="2026-03-14")

    rapport = compute_rapport_periode(db, "2026-03-15", "2026-04-15", ID_UTILISATEUR_TEST)

    assert rapport["valeur_debut_periode"] == 500.0
    assert rapport["valeur_fin_periode"] == 700.0
    assert rapport["nombre_transactions"] == 1


# ---------------------------------------------------------------------------
# Décomposition investi/généré (demande directe, 25/08/2026)
# ---------------------------------------------------------------------------


def test_gain_genere_isole_lappreciation_de_largent_ajoute(db, monkeypatch):
    """1000 € achetés pendant la période, valeur finale 1100 € : les 100 € d'écart
    sont bien attribués au « généré », pas confondus avec l'argent ajouté."""
    monkeypatch.setattr(
        historical_performance_service,
        "compute_portfolio_history",
        lambda db_, user_id_: _points(("2026-07-01", 0.0), ("2026-07-31", 1100.0)),
    )
    make_transaction(db, transaction_id="achat", symbol="AAA", amount=-1000.0, date="2026-07-05")

    rapport = compute_rapport_periode(db, "2026-07-01", "2026-07-31", ID_UTILISATEUR_TEST)

    assert rapport["montant_investi_periode"] == 1000.0
    assert rapport["gain_genere_periode"] == 100.0


def test_gain_genere_inclut_le_delta_de_valeur_realisee(db, monkeypatch):
    """Ventes/dividendes/intérêts de la période (`valeur_realisee_cumulee`) comptent
    dans le généré, même si la valeur du portefeuille détenu n'a pas bougé."""
    monkeypatch.setattr(
        historical_performance_service,
        "compute_portfolio_history",
        lambda db_, user_id_: _points(
            ("2026-07-01", 1000.0), ("2026-07-31", 1000.0), realise={"2026-07-01": 0.0, "2026-07-31": 50.0}
        ),
    )

    rapport = compute_rapport_periode(db, "2026-07-01", "2026-07-31", ID_UTILISATEUR_TEST)

    assert rapport["montant_investi_periode"] == 0.0
    assert rapport["gain_genere_periode"] == 50.0


def test_gain_genere_negatif_si_largent_ajoute_depasse_la_croissance(db, monkeypatch):
    """Portefeuille resté plat malgré un apport de 200 € pendant la période : le
    généré est bien négatif (sous-performance), pas masqué par l'apport."""
    monkeypatch.setattr(
        historical_performance_service,
        "compute_portfolio_history",
        lambda db_, user_id_: _points(("2026-07-01", 1000.0), ("2026-07-31", 1000.0)),
    )
    make_transaction(db, transaction_id="achat", symbol="AAA", amount=-200.0, date="2026-07-10")

    rapport = compute_rapport_periode(db, "2026-07-01", "2026-07-31", ID_UTILISATEUR_TEST)

    assert rapport["gain_genere_periode"] == -200.0


def test_gain_genere_ne_recompte_pas_lachat_quand_la_periode_precede_le_premier_point(db, monkeypatch):
    """Cas réel rencontré en vérification : période demandée à partir du 1er janvier,
    mais le tout premier point d'historique tombe le 1er juin (date du premier
    achat) — la position y est DÉJÀ achetée. `valeur_debut_periode` (affichage,
    inchangé) retombe sur ce point pour rester "honnête" plutôt que vide, mais le
    généré ne doit pas confondre ce repli avec une vraie valeur de départ : 1000 €
    achetés + aucune appréciation de prix (position restée plate) + 13,5 € de
    dividende doit donner 13,5 € généré, jamais -986,5 €."""
    monkeypatch.setattr(
        historical_performance_service,
        "compute_portfolio_history",
        lambda db_, user_id_: _points(
            ("2026-06-01", 1000.0), ("2026-12-31", 1000.0), realise={"2026-06-01": 0.0, "2026-12-31": 13.5}
        ),
    )
    make_transaction(db, transaction_id="achat", symbol="AAA", amount=-1000.0, date="2026-06-01")

    rapport = compute_rapport_periode(db, "2026-01-01", "2026-12-31", ID_UTILISATEUR_TEST)

    # Comportement d'affichage inchangé (evolution_pct existant, pas touché par le correctif).
    assert rapport["valeur_debut_periode"] == 1000.0
    assert rapport["evolution_pct"] == 0.0
    # Le correctif : le généré isole bien le dividende, sans re-compter l'achat.
    assert rapport["montant_investi_periode"] == 1000.0
    assert rapport["gain_genere_periode"] == 13.5


def test_gain_genere_none_sans_historique_mais_montant_investi_reste_calcule(db, monkeypatch):
    monkeypatch.setattr(historical_performance_service, "compute_portfolio_history", lambda db_, user_id_: [])
    make_transaction(db, transaction_id="achat", symbol="AAA", amount=-300.0, date="2026-07-10")

    rapport = compute_rapport_periode(db, "2026-07-01", "2026-07-31", ID_UTILISATEUR_TEST)

    assert rapport["gain_genere_periode"] is None
    assert rapport["montant_investi_periode"] == 300.0
