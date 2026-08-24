"""Verrouille `Holding.valeur_estimee`/`date_valeur_estimee` (Phase 1 de
`docs/ROADMAP.md`, immobilier/SCPI/assurance-vie/PER) : `date_valeur_estimee` n'est
jamais fournie par le client, elle est posée côté serveur uniquement quand
`valeur_estimee` change réellement dans l'appel — cf. `routers/portfolio.py`."""


def test_create_holding_avec_valeur_estimee_pose_la_date(client):
    reponse = client.post(
        "/api/portfolio/holdings",
        json={"ticker": "MAISON", "quantite": 1, "type_actif": "REAL_ESTATE", "prix_revient_moyen": 200000, "valeur_estimee": 250000},
    )

    assert reponse.status_code == 200
    corps = reponse.json()
    assert corps["valeur_estimee"] == 250000
    assert corps["date_valeur_estimee"] is not None


def test_create_holding_sans_valeur_estimee_ne_pose_pas_la_date(client):
    reponse = client.post("/api/portfolio/holdings", json={"ticker": "AAPL", "quantite": 5})

    assert reponse.status_code == 200
    assert reponse.json()["date_valeur_estimee"] is None


def test_update_valeur_estimee_avance_la_date(client):
    cree = client.post(
        "/api/portfolio/holdings", json={"ticker": "MAISON", "quantite": 1, "type_actif": "REAL_ESTATE", "valeur_estimee": 250000}
    ).json()
    premiere_date = cree["date_valeur_estimee"]

    reponse = client.patch(f"/api/portfolio/holdings/{cree['id']}", json={"valeur_estimee": 260000})

    assert reponse.status_code == 200
    corps = reponse.json()
    assert corps["valeur_estimee"] == 260000
    assert corps["date_valeur_estimee"] is not None
    assert corps["date_valeur_estimee"] >= premiere_date


def test_update_dun_autre_champ_ne_touche_pas_la_date_de_valeur_estimee(client):
    cree = client.post(
        "/api/portfolio/holdings", json={"ticker": "MAISON", "quantite": 1, "type_actif": "REAL_ESTATE", "valeur_estimee": 250000}
    ).json()
    premiere_date = cree["date_valeur_estimee"]

    reponse = client.patch(f"/api/portfolio/holdings/{cree['id']}", json={"nom": "Résidence principale"})

    assert reponse.status_code == 200
    assert reponse.json()["date_valeur_estimee"] == premiere_date


# --- `taux_pct` (backlog § 2.M.1, taxonomie élargie) ------------------------------
# Champ purement informatif : positif = intérêt attendu (épargne réglementée/
# salariale), négatif = décote attendue (véhicule) — jamais appliqué automatiquement
# à `valeur_estimee`, cf. `models.Holding.taux_pct`.


def test_create_holding_avec_taux_pct_positif_epargne(client):
    reponse = client.post(
        "/api/portfolio/holdings",
        json={"ticker": "LIVRETA", "quantite": 1, "type_actif": "REGULATED_SAVINGS", "valeur_estimee": 10000, "taux_pct": 3.0},
    )

    assert reponse.status_code == 200
    assert reponse.json()["taux_pct"] == 3.0


def test_create_holding_avec_taux_pct_negatif_vehicule(client):
    reponse = client.post(
        "/api/portfolio/holdings",
        json={"ticker": "VOITURE", "quantite": 1, "type_actif": "VEHICLE", "valeur_estimee": 15000, "taux_pct": -15.0},
    )

    assert reponse.status_code == 200
    assert reponse.json()["taux_pct"] == -15.0


def test_create_holding_sans_taux_pct_reste_none(client):
    reponse = client.post("/api/portfolio/holdings", json={"ticker": "AAPL", "quantite": 5})

    assert reponse.status_code == 200
    assert reponse.json()["taux_pct"] is None


def test_update_taux_pct(client):
    cree = client.post(
        "/api/portfolio/holdings", json={"ticker": "LIVRETA", "quantite": 1, "type_actif": "REGULATED_SAVINGS", "valeur_estimee": 10000}
    ).json()
    assert cree["taux_pct"] is None

    reponse = client.patch(f"/api/portfolio/holdings/{cree['id']}", json={"taux_pct": 2.5})

    assert reponse.status_code == 200
    assert reponse.json()["taux_pct"] == 2.5
