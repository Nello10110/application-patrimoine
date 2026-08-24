"""Verrouille `routers/objectifs.py` (backlog 2.O.1/2.O.2) : CRUD des objectifs,
indicateurs de situation, isolation entre comptes de connexion (IDOR)."""

from .conftest import ID_UTILISATEUR_B, ID_UTILISATEUR_TEST, NOM_UTILISATEUR_B, basculer_utilisateur, make_holding


def test_creer_lister_objectif(client, db):
    h = make_holding(db, ticker="LIVRETX", quantite=1, prix_revient_moyen=5000.0, type_actif="REGULATED_SAVINGS", valeur_estimee=5000.0)

    reponse = client.post(
        "/api/objectifs/",
        json={"nom": "Précaution", "type": "precaution", "montant_cible": 10000.0, "echeance": "2028-01-01", "holding_ids": [h.id]},
    )
    assert reponse.status_code == 200, reponse.text
    corps = reponse.json()
    assert corps["nom"] == "Précaution"
    assert corps["valeur_a_la_creation"] == 5000.0
    assert corps["actifs_rattaches"] == [{"holding_id": h.id, "ticker": "LIVRETX", "nom": h.nom}]

    reponse = client.get("/api/objectifs/")
    assert reponse.status_code == 200
    assert [o["nom"] for o in reponse.json()] == ["Précaution"]


def test_creer_objectif_nom_vide_rejete(client):
    reponse = client.post("/api/objectifs/", json={"nom": "  ", "montant_cible": 1000.0, "echeance": "2028-01-01"})
    assert reponse.status_code == 400


def test_creer_objectif_montant_negatif_rejete(client):
    reponse = client.post("/api/objectifs/", json={"nom": "X", "montant_cible": -100.0, "echeance": "2028-01-01"})
    assert reponse.status_code == 400


def test_creer_objectif_type_inconnu_rejete(client):
    reponse = client.post("/api/objectifs/", json={"nom": "X", "type": "invalide", "montant_cible": 1000.0, "echeance": "2028-01-01"})
    assert reponse.status_code == 400


def test_get_objectif_par_id(client):
    id_objectif = client.post("/api/objectifs/", json={"nom": "X", "montant_cible": 1000.0, "echeance": "2028-01-01"}).json()["id"]

    reponse = client.get(f"/api/objectifs/{id_objectif}")
    assert reponse.status_code == 200
    assert reponse.json()["id"] == id_objectif


def test_get_objectif_introuvable_404(client):
    reponse = client.get("/api/objectifs/999")
    assert reponse.status_code == 404


def test_supprimer_objectif(client):
    id_objectif = client.post("/api/objectifs/", json={"nom": "X", "montant_cible": 1000.0, "echeance": "2028-01-01"}).json()["id"]

    reponse = client.delete(f"/api/objectifs/{id_objectif}")
    assert reponse.status_code == 204
    assert client.get("/api/objectifs/").json() == []


def test_indicateurs_situation(client):
    reponse = client.get("/api/objectifs/situation/indicateurs")
    assert reponse.status_code == 200
    body = reponse.json()
    assert "matelas_securite_mois" in body
    assert "taux_endettement_pct" in body
    assert "part_immobilisee_pct" in body


def test_isolation_entre_utilisateurs(client, db):
    id_objectif = client.post("/api/objectifs/", json={"nom": "Secret", "montant_cible": 1000.0, "echeance": "2028-01-01"}).json()["id"]

    basculer_utilisateur(db, ID_UTILISATEUR_B, NOM_UTILISATEUR_B)

    reponse = client.get("/api/objectifs/")
    assert reponse.json() == []

    reponse = client.get(f"/api/objectifs/{id_objectif}")
    assert reponse.status_code == 404

    reponse = client.delete(f"/api/objectifs/{id_objectif}")
    assert reponse.status_code == 404
