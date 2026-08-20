"""Verrouille `GET /api/patrimoine/net`, `/simulation` et `/fire` (roadmap Phase 1
et 2, `docs/ROADMAP.md`)."""

from datetime import datetime

from app.models import Loan

from .conftest import make_holding


def test_patrimoine_net_vide(client):
    reponse = client.get("/api/patrimoine/net")

    assert reponse.status_code == 200
    assert reponse.json() == {
        "actifs_totaux": 0,
        "passifs_totaux": 0,
        "patrimoine_net": 0,
        "repartition_par_classe": [],
    }


def test_patrimoine_net_actifs_moins_passifs(client, db):
    make_holding(db, ticker="MAISON", type_actif="REAL_ESTATE", quantite=1, prix_revient_moyen=200000.0, valeur_estimee=300000.0)
    db.add(
        Loan(
            libelle="Crédit immo",
            capital_initial=200000.0,
            taux_annuel_pct=0.0,
            mensualite=1000.0,
            date_debut=datetime(2020, 1, 1),
            duree_mois=200,
            capital_restant_du_manuel=120000.0,
        )
    )
    db.commit()

    reponse = client.get("/api/patrimoine/net")

    assert reponse.status_code == 200
    corps = reponse.json()
    assert corps["actifs_totaux"] == 300000.0
    assert corps["passifs_totaux"] == 120000.0
    assert corps["patrimoine_net"] == 180000.0
    assert corps["repartition_par_classe"] == [{"categorie": "Immobilier", "valeur": 300000.0}]


def test_simulation_part_du_patrimoine_net_actuel(client, db):
    make_holding(db, ticker="AAA", type_actif="STOCK", quantite=1, prix_revient_moyen=1000.0)

    reponse = client.get("/api/patrimoine/simulation", params={"rendement_annuel_pct": 0, "epargne_mensuelle": 0, "annees": 3})

    assert reponse.status_code == 200
    corps = reponse.json()
    assert corps["valeur_depart"] == 1000.0
    # Sans rendement ni épargne, la valeur reste constante sur toute la trajectoire.
    assert [p["valeur"] for p in corps["points"]] == [1000.0, 1000.0, 1000.0, 1000.0]
    assert [p["annee"] for p in corps["points"]] == [0, 1, 2, 3]


def test_simulation_bornes_rejetees_en_400(client):
    assert client.get("/api/patrimoine/simulation", params={"rendement_annuel_pct": 999, "epargne_mensuelle": 0, "annees": 3}).status_code == 400
    assert client.get("/api/patrimoine/simulation", params={"rendement_annuel_pct": 5, "epargne_mensuelle": -1, "annees": 3}).status_code == 400
    assert client.get("/api/patrimoine/simulation", params={"rendement_annuel_pct": 5, "epargne_mensuelle": 0, "annees": 0}).status_code == 400
    assert client.get("/api/patrimoine/simulation", params={"rendement_annuel_pct": 5, "epargne_mensuelle": 0, "annees": 61}).status_code == 400


def test_fire_part_du_patrimoine_net_actuel_et_taux_par_defaut(client, db):
    make_holding(db, ticker="AAA", type_actif="STOCK", quantite=1, prix_revient_moyen=1_500_000.0)

    reponse = client.get(
        "/api/patrimoine/fire", params={"rendement_annuel_pct": 5, "epargne_mensuelle": 0, "depense_annuelle_cible": 40000}
    )

    assert reponse.status_code == 200
    corps = reponse.json()
    assert corps["valeur_depart"] == 1_500_000.0
    assert corps["patrimoine_necessaire"] == 1_000_000.0  # taux de retrait par défaut : 4 %
    assert corps["annees_avant_independance"] == 0.0  # déjà indépendant


def test_fire_taux_de_retrait_personnalise(client, db):
    make_holding(db, ticker="AAA", type_actif="STOCK", quantite=1, prix_revient_moyen=0.0)

    reponse = client.get(
        "/api/patrimoine/fire",
        params={"rendement_annuel_pct": 0, "epargne_mensuelle": 0, "depense_annuelle_cible": 40000, "taux_retrait_pct": 8},
    )

    assert reponse.status_code == 200
    assert reponse.json()["patrimoine_necessaire"] == 500000.0


def test_fire_bornes_rejetees_en_400(client):
    assert (
        client.get(
            "/api/patrimoine/fire", params={"rendement_annuel_pct": 5, "epargne_mensuelle": 0, "depense_annuelle_cible": 0}
        ).status_code
        == 400
    )
    assert (
        client.get(
            "/api/patrimoine/fire",
            params={"rendement_annuel_pct": 5, "epargne_mensuelle": 0, "depense_annuelle_cible": 40000, "taux_retrait_pct": 0},
        ).status_code
        == 400
    )
