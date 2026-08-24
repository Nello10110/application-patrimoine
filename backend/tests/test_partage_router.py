"""Verrouille les routes de gestion (`/api/partage`, réservée au propriétaire, via
la fixture `client`) et de consultation publique (`/api/partage-public`, testée
directement sans jeton — mêmes routes que verrait un vrai visiteur anonyme)."""

from app.services import partage_service

from .conftest import ID_UTILISATEUR_TEST, make_holding


def test_create_lien(client):
    reponse = client.post("/api/partage", json={"nom": "Pour la banque"})

    assert reponse.status_code == 200
    corps = reponse.json()
    assert corps["nom"] == "Pour la banque"
    assert corps["code_requis"] is False
    assert "token" in corps
    assert corps["revoked_at"] is None


def test_create_lien_nom_vide_rejete(client):
    assert client.post("/api/partage", json={"nom": "   "}).status_code == 400


def test_create_lien_avec_code_trop_court_rejete(client):
    assert client.post("/api/partage", json={"nom": "Test", "code": "ab"}).status_code == 400


def test_create_lien_detenteur_dun_autre_foyer_404(client, db):
    from .conftest import ID_UTILISATEUR_B, basculer_utilisateur

    id_detenteur_a = client.post("/api/detenteurs", json={"nom": "Alice", "type": "personne"}).json()["id"]
    basculer_utilisateur(db, ID_UTILISATEUR_B, "test-b")

    reponse = client.post("/api/partage", json={"nom": "Test", "detenteur_id": id_detenteur_a})

    assert reponse.status_code == 404


def test_list_liens(client):
    client.post("/api/partage", json={"nom": "Lien 1"})
    client.post("/api/partage", json={"nom": "Lien 2"})

    reponse = client.get("/api/partage")

    assert reponse.status_code == 200
    assert len(reponse.json()) == 2


def test_revoke_lien(client):
    lien_id = client.post("/api/partage", json={"nom": "Test"}).json()["id"]

    reponse = client.delete(f"/api/partage/{lien_id}")

    assert reponse.status_code == 200
    liens = client.get("/api/partage").json()
    assert liens[0]["revoked_at"] is not None


def test_revoke_lien_inexistant_404(client):
    assert client.delete("/api/partage/999999").status_code == 404


def test_revoke_lien_dun_autre_foyer_404(client, db):
    from .conftest import ID_UTILISATEUR_B, basculer_utilisateur

    lien_id = client.post("/api/partage", json={"nom": "Test"}).json()["id"]
    basculer_utilisateur(db, ID_UTILISATEUR_B, "test-b")

    assert client.delete(f"/api/partage/{lien_id}").status_code == 404


# --- Consultation publique (sans jeton) -------------------------------------


def test_meta_lien_inexistant_404(client):
    assert client.get("/api/partage-public/jeton-inexistant/meta").status_code == 404


def test_meta_lien_valide(client):
    token = client.post("/api/partage", json={"nom": "Test"}).json()["token"]

    reponse = client.get(f"/api/partage-public/{token}/meta")

    assert reponse.status_code == 200
    assert reponse.json() == {"nom_lien": "Test", "code_requis": False}


def test_meta_lien_avec_code(client):
    token = client.post("/api/partage", json={"nom": "Test", "code": "1234"}).json()["token"]

    reponse = client.get(f"/api/partage-public/{token}/meta")

    assert reponse.json()["code_requis"] is True


def test_consulter_lien_sans_code_requis(client, db):
    make_holding(db, ticker="AAA", type_actif="STOCK", quantite=10, prix_revient_moyen=100.0)
    token = client.post("/api/partage", json={"nom": "Test"}).json()["token"]

    reponse = client.post(f"/api/partage-public/{token}", json={})

    assert reponse.status_code == 200
    assert reponse.json()["patrimoine_net"]["actifs_totaux"] == 1000.0


def test_consulter_lien_avec_bon_code(client):
    token = client.post("/api/partage", json={"nom": "Test", "code": "1234"}).json()["token"]

    reponse = client.post(f"/api/partage-public/{token}", json={"code": "1234"})

    assert reponse.status_code == 200


def test_consulter_lien_avec_mauvais_code(client):
    token = client.post("/api/partage", json={"nom": "Test", "code": "1234"}).json()["token"]

    reponse = client.post(f"/api/partage-public/{token}", json={"code": "0000"})

    assert reponse.status_code == 401


def test_consulter_lien_revoque_404(client):
    lien = client.post("/api/partage", json={"nom": "Test"}).json()
    client.delete(f"/api/partage/{lien['id']}")

    reponse = client.post(f"/api/partage-public/{lien['token']}", json={})

    assert reponse.status_code == 404


def test_consulter_lien_verrouille_apres_echecs_repetes(client, db):
    """Backlog 2.Q.1 : 5 codes incorrects verrouillent la consultation de CE lien,
    même mécanique que le verrouillage de connexion (2.L.2)."""
    token = client.post("/api/partage", json={"nom": "Test", "code": "1234"}).json()["token"]

    for _ in range(partage_service.SEUIL_TENTATIVES):
        reponse = client.post(f"/api/partage-public/{token}", json={"code": "0000"})
        assert reponse.status_code == 401

    verrouille = client.post(f"/api/partage-public/{token}", json={"code": "1234"})
    assert verrouille.status_code == 429


def test_consulter_lien_ne_leak_jamais_les_positions_individuelles(client, db):
    """Verrou de conception (2.Q.1) : la charge publique reste agrégée, jamais le
    détail position par position — même quand `inclure_repartition` est actif."""
    make_holding(db, ticker="SECRET_TICKER", type_actif="STOCK", quantite=10, prix_revient_moyen=100.0)
    token = client.post("/api/partage", json={"nom": "Test"}).json()["token"]

    reponse = client.post(f"/api/partage-public/{token}", json={})

    assert "SECRET_TICKER" not in reponse.text
