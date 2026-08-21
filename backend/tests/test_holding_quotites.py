"""Verrouille `PUT /api/portfolio/holdings/{ticker}/quotites` et la présence des
quotités dans la fiche détaillée (backlog 2.L.1)."""

from .conftest import ID_UTILISATEUR_B, ID_UTILISATEUR_TEST, NOM_UTILISATEUR_B, NOM_UTILISATEUR_TEST, basculer_utilisateur, make_holding


def test_repartir_un_actif_entre_deux_detenteurs(client, db):
    make_holding(db, ticker="AAA", type_actif="STOCK", quantite=10, prix_revient_moyen=100.0)
    alice = client.post("/api/detenteurs", json={"nom": "Alice", "type": "personne"}).json()
    bob = client.post("/api/detenteurs", json={"nom": "Bob", "type": "personne"}).json()

    reponse = client.put(
        "/api/portfolio/holdings/AAA/quotites",
        json={"quotites": [{"detenteur_id": alice["id"], "quotite_pct": 60.0}, {"detenteur_id": bob["id"], "quotite_pct": 40.0}]},
    )

    assert reponse.status_code == 200

    detail = client.get("/api/portfolio/holdings/AAA/detail").json()
    quotites = {q["detenteur_nom"]: q for q in detail["quotites"]}
    assert quotites["Alice"]["quotite_pct"] == 60.0
    assert quotites["Alice"]["part_detenue"] == 600.0
    assert quotites["Bob"]["part_detenue"] == 400.0


def test_repartition_dont_la_somme_nest_pas_100_est_refusee(client, db):
    make_holding(db, ticker="AAA", type_actif="STOCK", quantite=10, prix_revient_moyen=100.0)
    alice = client.post("/api/detenteurs", json={"nom": "Alice", "type": "personne"}).json()

    reponse = client.put(
        "/api/portfolio/holdings/AAA/quotites",
        json={"quotites": [{"detenteur_id": alice["id"], "quotite_pct": 60.0}]},
    )

    assert reponse.status_code == 400


def test_liste_vide_retire_toute_repartition(client, db):
    make_holding(db, ticker="AAA", type_actif="STOCK", quantite=10, prix_revient_moyen=100.0)
    alice = client.post("/api/detenteurs", json={"nom": "Alice", "type": "personne"}).json()
    client.put("/api/portfolio/holdings/AAA/quotites", json={"quotites": [{"detenteur_id": alice["id"], "quotite_pct": 100.0}]})

    reponse = client.put("/api/portfolio/holdings/AAA/quotites", json={"quotites": []})

    assert reponse.status_code == 200
    assert client.get("/api/portfolio/holdings/AAA/detail").json()["quotites"] == []


def test_ticker_introuvable_renvoie_404(client):
    reponse = client.put("/api/portfolio/holdings/INTROUVABLE/quotites", json={"quotites": []})
    assert reponse.status_code == 404


def test_repartir_avec_un_detenteur_dun_autre_compte_est_refuse(client, db):
    """IDOR (backlog 2.L.1) : impossible de répartir son actif vers le détenteur
    d'un autre compte, même en devinant son id."""
    make_holding(db, ticker="AAA", type_actif="STOCK", quantite=10, prix_revient_moyen=100.0)
    basculer_utilisateur(db, ID_UTILISATEUR_B, NOM_UTILISATEUR_B)
    detenteur_b = client.post("/api/detenteurs", json={"nom": "Intrus", "type": "personne"}).json()
    basculer_utilisateur(db, ID_UTILISATEUR_TEST, NOM_UTILISATEUR_TEST)

    reponse = client.put(
        "/api/portfolio/holdings/AAA/quotites",
        json={"quotites": [{"detenteur_id": detenteur_b["id"], "quotite_pct": 100.0}]},
    )

    assert reponse.status_code == 400


def test_quotite_a_zero_est_refusee(client, db):
    make_holding(db, ticker="AAA", type_actif="STOCK", quantite=10, prix_revient_moyen=100.0)
    alice = client.post("/api/detenteurs", json={"nom": "Alice", "type": "personne"}).json()

    reponse = client.put(
        "/api/portfolio/holdings/AAA/quotites",
        json={"quotites": [{"detenteur_id": alice["id"], "quotite_pct": 0.0}]},
    )

    assert reponse.status_code == 400


def test_actif_sans_repartition_a_une_liste_de_quotites_vide(client, db):
    make_holding(db, ticker="AAA", type_actif="STOCK", quantite=10, prix_revient_moyen=100.0)

    detail = client.get("/api/portfolio/holdings/AAA/detail").json()

    assert detail["quotites"] == []


def test_valeur_estimee_est_utilisee_pour_le_calcul_des_parts(client, db):
    """Non-régression (bug corrigé en marge de 2.L.1) : la fiche détaillée doit
    utiliser `valeur_estimee` (immobilier/SCPI/assurance-vie/PER), pas
    `prix_revient_moyen * quantite` — sinon la part détenue/nette est fausse pour
    tout bien valorisé manuellement."""
    make_holding(db, ticker="MAISON", type_actif="REAL_ESTATE", quantite=1, prix_revient_moyen=200000.0, valeur_estimee=300000.0)
    alice = client.post("/api/detenteurs", json={"nom": "Alice", "type": "personne"}).json()
    client.put("/api/portfolio/holdings/MAISON/quotites", json={"quotites": [{"detenteur_id": alice["id"], "quotite_pct": 100.0}]})

    detail = client.get("/api/portfolio/holdings/MAISON/detail").json()

    assert detail["valeur"] == 300000.0
    assert detail["quotites"][0]["part_detenue"] == 300000.0
