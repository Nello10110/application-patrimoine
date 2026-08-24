"""Verrouille `POST /api/export/declaration-patrimoine.pdf` (backlog 2.Q.2) :
statut, type de contenu, en-tête de téléchargement, et protection IDOR sur
`detenteur_id`. Le contenu du document lui-même est déjà couvert par
`test_declaration_patrimoine_service.py`."""

from .conftest import ID_UTILISATEUR_B, basculer_utilisateur, make_holding


def test_route_repond_200_avec_un_pdf(client):
    reponse = client.post("/api/export/declaration-patrimoine.pdf", json={})

    assert reponse.status_code == 200
    assert reponse.headers["content-type"] == "application/pdf"
    assert reponse.content.startswith(b"%PDF")


def test_content_disposition_propose_un_telechargement_avec_nom_date(client):
    reponse = client.post("/api/export/declaration-patrimoine.pdf", json={})

    assert "declaration-patrimoine-" in reponse.headers["content-disposition"]
    assert ".pdf" in reponse.headers["content-disposition"]


def test_selection_holding_ids_restreint_le_contenu(client, db):
    aaa = make_holding(db, ticker="AAA", nom="Action A", type_actif="STOCK", quantite=10, prix_revient_moyen=100.0)
    make_holding(db, ticker="BBB", nom="Action B", type_actif="STOCK", quantite=1, prix_revient_moyen=500.0)

    reponse = client.post("/api/export/declaration-patrimoine.pdf", json={"holding_ids": [aaa.id]})

    assert reponse.status_code == 200


def test_detenteur_dun_autre_foyer_404(client, db):
    id_detenteur_a = client.post("/api/detenteurs", json={"nom": "Alice", "type": "personne"}).json()["id"]
    basculer_utilisateur(db, ID_UTILISATEUR_B, "test-b")

    reponse = client.post("/api/export/declaration-patrimoine.pdf", json={"detenteur_id": id_detenteur_a})

    assert reponse.status_code == 404


def test_destinataire_et_inclure_profil_acceptes(client):
    reponse = client.post(
        "/api/export/declaration-patrimoine.pdf", json={"destinataire": "Banque XYZ", "inclure_profil": True}
    )

    assert reponse.status_code == 200
