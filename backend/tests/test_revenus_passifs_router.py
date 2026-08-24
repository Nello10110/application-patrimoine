"""Verrouille `GET /api/performance/revenus-passifs` (backlog 2.P.3)."""

from .conftest import make_holding


def test_route_repond_200_sans_donnees(client):
    reponse = client.get("/api/performance/revenus-passifs")

    assert reponse.status_code == 200
    assert reponse.json()["revenu_total_projete_annuel"] == 0.0


def test_route_reflete_les_interets_de_livret(client, db):
    make_holding(db, ticker="LIVRETA", type_actif="REGULATED_SAVINGS", quantite=1, valeur_estimee=10000.0, taux_pct=3.0)

    reponse = client.get("/api/performance/revenus-passifs")

    assert reponse.status_code == 200
    assert reponse.json()["interets_livrets_annuels"] == 300.0
