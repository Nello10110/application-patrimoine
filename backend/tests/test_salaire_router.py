"""Verrouille `GET/POST/PUT/DELETE /api/salaire` (plusieurs entrées par année, CRUD +
isolation inter-comptes)."""

from .conftest import ID_UTILISATEUR_B, ID_UTILISATEUR_TEST, NOM_UTILISATEUR_B, basculer_utilisateur

PAYLOAD_VALIDE = {
    "annee": 2026,
    "nom": "Salaire principal",
    "montant": 3000.0,
    "type_montant": "brut",
    "periodicite": "mensuel",
    "statut": "cadre",
    "nombre_mois": 12,
    "taux_imposition_pct": 10.0,
}


def test_liste_vide_par_defaut(client):
    corps = client.get("/api/salaire/").json()
    assert corps == {"entrees": [], "syntheses": []}


def test_creer_et_relister_salaire(client):
    reponse = client.post("/api/salaire", json=PAYLOAD_VALIDE)
    assert reponse.status_code == 200
    corps = reponse.json()
    assert corps["annee"] == 2026
    assert corps["nom"] == "Salaire principal"
    assert corps["brut_annuel"] == 36000.0
    assert corps["net_avant_impot_annuel"] == 27000.0  # 36000 * 0.75 (cadre)
    assert corps["net_apres_impot_annuel"] == 24300.0  # 27000 * 0.9

    liste = client.get("/api/salaire/").json()
    assert len(liste["entrees"]) == 1
    assert len(liste["syntheses"]) == 1
    assert liste["syntheses"][0]["annee"] == 2026
    assert liste["syntheses"][0]["nombre_salaires"] == 1


def test_plusieurs_entrees_la_meme_annee_avec_taux_differents(client):
    client.post("/api/salaire", json={**PAYLOAD_VALIDE, "nom": "Paul", "taux_imposition_pct": 10.0})
    client.post("/api/salaire", json={**PAYLOAD_VALIDE, "nom": "Julie", "montant": 2000.0, "taux_imposition_pct": 20.0})

    liste = client.get("/api/salaire/").json()
    assert len(liste["entrees"]) == 2
    assert {e["nom"] for e in liste["entrees"]} == {"Paul", "Julie"}
    assert len(liste["syntheses"]) == 1
    assert liste["syntheses"][0]["nombre_salaires"] == 2


def test_synthese_annee_dediee(client):
    client.post("/api/salaire", json=PAYLOAD_VALIDE)

    reponse = client.get("/api/salaire/synthese/2026")
    assert reponse.status_code == 200
    assert reponse.json()["nombre_salaires"] == 1

    # Année sans aucune entrée : synthèse à zéro, pas une erreur.
    reponse_vide = client.get("/api/salaire/synthese/2099")
    assert reponse_vide.status_code == 200
    assert reponse_vide.json()["nombre_salaires"] == 0


def test_modifier_une_entree(client):
    id_salaire = client.post("/api/salaire", json=PAYLOAD_VALIDE).json()["id"]

    reponse = client.put(f"/api/salaire/{id_salaire}", json={**PAYLOAD_VALIDE, "montant": 4000.0, "nom": "Renommé"})

    assert reponse.status_code == 200
    corps = reponse.json()
    assert corps["nom"] == "Renommé"
    assert corps["brut_annuel"] == 48000.0
    assert len(client.get("/api/salaire/").json()["entrees"]) == 1  # toujours une seule ligne, pas un doublon


def test_modifier_entree_inexistante_renvoie_404(client):
    reponse = client.put("/api/salaire/9999", json=PAYLOAD_VALIDE)
    assert reponse.status_code == 404


def test_montant_negatif_est_rejete(client):
    reponse = client.post("/api/salaire", json={**PAYLOAD_VALIDE, "montant": -100.0})
    assert reponse.status_code == 400


def test_statut_invalide_est_rejete(client):
    reponse = client.post("/api/salaire", json={**PAYLOAD_VALIDE, "statut": "freelance"})
    assert reponse.status_code == 400


def test_taux_imposition_hors_bornes_est_rejete(client):
    reponse = client.post("/api/salaire", json={**PAYLOAD_VALIDE, "taux_imposition_pct": 150.0})
    assert reponse.status_code == 400


def test_supprimer_une_entree(client):
    id_salaire = client.post("/api/salaire", json=PAYLOAD_VALIDE).json()["id"]

    reponse = client.delete(f"/api/salaire/{id_salaire}")
    assert reponse.status_code == 204
    assert client.get("/api/salaire/").json()["entrees"] == []
    assert client.delete(f"/api/salaire/{id_salaire}").status_code == 404


def test_salaire_dun_autre_utilisateur_est_inaccessible(client, db):
    id_salaire = client.post("/api/salaire", json=PAYLOAD_VALIDE).json()["id"]
    basculer_utilisateur(db, ID_UTILISATEUR_B, NOM_UTILISATEUR_B)

    assert client.get("/api/salaire/").json() == {"entrees": [], "syntheses": []}
    assert client.put(f"/api/salaire/{id_salaire}", json=PAYLOAD_VALIDE).status_code == 404
    assert client.delete(f"/api/salaire/{id_salaire}").status_code == 404

    basculer_utilisateur(db, ID_UTILISATEUR_TEST, "test")
    assert len(client.get("/api/salaire/").json()["entrees"]) == 1
