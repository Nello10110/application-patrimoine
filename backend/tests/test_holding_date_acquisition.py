"""Verrouille `Holding.date_acquisition` (retour utilisateur, 26/08/2026) : date
d'acquisition d'un bien (achat de l'appartement, souscription du contrat...) déclarée
par l'utilisateur — distincte de `created_at` (date de saisie de la ligne dans
l'application) et de `date_valeur_estimee` (date de dernière estimation)."""


def test_create_holding_avec_date_acquisition(client):
    reponse = client.post(
        "/api/portfolio/holdings",
        json={
            "ticker": "MAISON",
            "quantite": 1,
            "type_actif": "REAL_ESTATE",
            "prix_revient_moyen": 200000,
            "valeur_estimee": 250000,
            "date_acquisition": "2021-06-15",
        },
    )

    assert reponse.status_code == 200
    corps = reponse.json()
    assert corps["date_acquisition"].startswith("2021-06-15")


def test_create_holding_sans_date_acquisition_reste_none(client):
    reponse = client.post("/api/portfolio/holdings", json={"ticker": "AAPL", "quantite": 5})

    assert reponse.status_code == 200
    assert reponse.json()["date_acquisition"] is None


def test_create_holding_avec_date_acquisition_mal_formatee_est_rejetee(client):
    reponse = client.post(
        "/api/portfolio/holdings",
        json={"ticker": "MAISON", "quantite": 1, "type_actif": "REAL_ESTATE", "date_acquisition": "15/06/2021"},
    )

    assert reponse.status_code == 400
    assert "AAAA-MM-JJ" in reponse.json()["detail"]


def test_update_pose_la_date_acquisition(client):
    cree = client.post(
        "/api/portfolio/holdings", json={"ticker": "MAISON", "quantite": 1, "type_actif": "REAL_ESTATE", "valeur_estimee": 250000}
    ).json()
    assert cree["date_acquisition"] is None

    reponse = client.patch(f"/api/portfolio/holdings/{cree['id']}", json={"date_acquisition": "2019-03-01"})

    assert reponse.status_code == 200
    assert reponse.json()["date_acquisition"].startswith("2019-03-01")


def test_update_peut_effacer_la_date_acquisition(client):
    cree = client.post(
        "/api/portfolio/holdings",
        json={"ticker": "MAISON", "quantite": 1, "type_actif": "REAL_ESTATE", "valeur_estimee": 250000, "date_acquisition": "2019-03-01"},
    ).json()

    reponse = client.patch(f"/api/portfolio/holdings/{cree['id']}", json={"date_acquisition": None})

    assert reponse.status_code == 200
    assert reponse.json()["date_acquisition"] is None


def test_update_dun_autre_champ_ne_touche_pas_la_date_acquisition(client):
    cree = client.post(
        "/api/portfolio/holdings",
        json={"ticker": "MAISON", "quantite": 1, "type_actif": "REAL_ESTATE", "valeur_estimee": 250000, "date_acquisition": "2019-03-01"},
    ).json()

    reponse = client.patch(f"/api/portfolio/holdings/{cree['id']}", json={"nom": "Résidence principale"})

    assert reponse.status_code == 200
    assert reponse.json()["date_acquisition"].startswith("2019-03-01")
