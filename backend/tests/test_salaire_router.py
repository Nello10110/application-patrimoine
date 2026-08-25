"""Verrouille `GET/PUT/DELETE /api/salaire` (CRUD + isolation inter-comptes)."""

from .conftest import ID_UTILISATEUR_B, ID_UTILISATEUR_TEST, NOM_UTILISATEUR_B, basculer_utilisateur

PAYLOAD_VALIDE = {"montant": 3000.0, "type_montant": "brut", "periodicite": "mensuel", "statut": "cadre", "nombre_mois": 12}


def test_liste_vide_par_defaut(client):
    assert client.get("/api/salaire/").json() == []


def test_get_annee_absente_renvoie_404(client):
    assert client.get("/api/salaire/2026").status_code == 404


def test_creer_et_relire_salaire(client):
    reponse = client.put("/api/salaire/2026", json=PAYLOAD_VALIDE)
    assert reponse.status_code == 200
    corps = reponse.json()
    assert corps["annee"] == 2026
    assert corps["brut_annuel"] == 36000.0
    assert corps["net_avant_impot_annuel"] == 27000.0  # 36000 * 0.75 (cadre)

    reponse = client.get("/api/salaire/2026")
    assert reponse.status_code == 200
    assert reponse.json()["brut_annuel"] == 36000.0

    assert [s["annee"] for s in client.get("/api/salaire/").json()] == [2026]


def test_upsert_remplace_la_ligne_existante(client):
    client.put("/api/salaire/2026", json=PAYLOAD_VALIDE)
    reponse = client.put("/api/salaire/2026", json={**PAYLOAD_VALIDE, "montant": 4000.0})

    assert reponse.status_code == 200
    assert reponse.json()["brut_annuel"] == 48000.0
    assert len(client.get("/api/salaire/").json()) == 1


def test_montant_negatif_est_rejete(client):
    reponse = client.put("/api/salaire/2026", json={**PAYLOAD_VALIDE, "montant": -100.0})
    assert reponse.status_code == 400


def test_statut_invalide_est_rejete(client):
    reponse = client.put("/api/salaire/2026", json={**PAYLOAD_VALIDE, "statut": "freelance"})
    assert reponse.status_code == 400


def test_supprimer_salaire(client):
    client.put("/api/salaire/2026", json=PAYLOAD_VALIDE)

    reponse = client.delete("/api/salaire/2026")
    assert reponse.status_code == 204
    assert client.get("/api/salaire/2026").status_code == 404
    assert client.delete("/api/salaire/2026").status_code == 404


def test_salaire_dun_autre_utilisateur_est_inaccessible(client, db):
    client.put("/api/salaire/2026", json=PAYLOAD_VALIDE)
    basculer_utilisateur(db, ID_UTILISATEUR_B, NOM_UTILISATEUR_B)

    assert client.get("/api/salaire/").json() == []
    assert client.get("/api/salaire/2026").status_code == 404
    assert client.delete("/api/salaire/2026").status_code == 404

    basculer_utilisateur(db, ID_UTILISATEUR_TEST, "test")
    assert client.get("/api/salaire/2026").json()["brut_annuel"] == 36000.0
