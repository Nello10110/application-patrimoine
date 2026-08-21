"""Verrouille `GET/POST/PATCH/DELETE /api/detenteurs` (backlog 2.L.1), y compris
l'isolation entre comptes de connexion (IDOR)."""

from .conftest import ID_UTILISATEUR_B, ID_UTILISATEUR_TEST, NOM_UTILISATEUR_B, basculer_utilisateur


def test_creer_lister_detenteur(client):
    reponse = client.post("/api/detenteurs", json={"nom": "Alice", "type": "personne"})
    assert reponse.status_code == 200
    corps = reponse.json()
    assert corps["nom"] == "Alice"
    assert corps["type"] == "personne"

    reponse = client.get("/api/detenteurs")
    assert reponse.status_code == 200
    assert [d["nom"] for d in reponse.json()] == ["Alice"]


def test_creer_detenteur_type_invalide_est_rejete(client):
    reponse = client.post("/api/detenteurs", json={"nom": "Alice", "type": "chat"})
    assert reponse.status_code == 400


def test_creer_detenteur_nom_vide_est_rejete(client):
    reponse = client.post("/api/detenteurs", json={"nom": "   ", "type": "personne"})
    assert reponse.status_code == 400


def test_modifier_detenteur(client):
    id_detenteur = client.post("/api/detenteurs", json={"nom": "Alice", "type": "personne"}).json()["id"]

    reponse = client.patch(f"/api/detenteurs/{id_detenteur}", json={"nom": "Alicia"})

    assert reponse.status_code == 200
    assert reponse.json()["nom"] == "Alicia"


def test_supprimer_detenteur(client):
    id_detenteur = client.post("/api/detenteurs", json={"nom": "Alice", "type": "personne"}).json()["id"]

    reponse = client.delete(f"/api/detenteurs/{id_detenteur}")

    assert reponse.status_code == 200
    assert client.get("/api/detenteurs").json() == []


def test_detenteur_dun_autre_utilisateur_est_inaccessible(client, db):
    id_detenteur = client.post("/api/detenteurs", json={"nom": "Alice", "type": "personne"}).json()["id"]
    basculer_utilisateur(db, ID_UTILISATEUR_B, NOM_UTILISATEUR_B)

    assert client.get("/api/detenteurs").json() == []
    assert client.patch(f"/api/detenteurs/{id_detenteur}", json={"nom": "Piraté"}).status_code == 404
    assert client.delete(f"/api/detenteurs/{id_detenteur}").status_code == 404

    # Toujours là, inchangé, côté utilisateur A.
    basculer_utilisateur(db, ID_UTILISATEUR_TEST, "test")
    assert client.get("/api/detenteurs").json()[0]["nom"] == "Alice"
