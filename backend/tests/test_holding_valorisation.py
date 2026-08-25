"""Point d'historique daté par l'utilisateur (backlog § 2.S.1, écran Épargne) —
`PUT /holdings/{ticker}/valorisation`, seule route qui accepte une date choisie par
le client plutôt que `datetime.now()` (cf. `create_holding`/`update_holding`,
inchangés). Règle d'antidatage : un point antidaté ne doit jamais écraser une valeur
courante plus récente déjà connue."""

from .conftest import ID_UTILISATEUR_B, ID_UTILISATEUR_TEST, NOM_UTILISATEUR_B, NOM_UTILISATEUR_TEST, basculer_utilisateur, make_holding


def test_ajoute_un_point_dhistorique_a_la_date_choisie(client, db):
    make_holding(db, ticker="AV1", type_actif="LIFE_INSURANCE")

    reponse = client.put("/api/portfolio/holdings/AV1/valorisation", json={"valeur": 10000.0, "date": "2026-03-15"})

    assert reponse.status_code == 200
    historique = client.get("/api/portfolio/holdings/AV1/immobilier-history").json()
    assert len(historique) == 1
    assert historique[0]["valeur"] == 10000.0
    assert historique[0]["date_valeur"].startswith("2026-03-15")


def test_met_a_jour_la_valeur_courante_quand_le_point_est_le_plus_recent(client, db):
    make_holding(db, ticker="AV1", type_actif="LIFE_INSURANCE")
    client.put("/api/portfolio/holdings/AV1/valorisation", json={"valeur": 10000.0, "date": "2026-01-01"})

    reponse = client.put("/api/portfolio/holdings/AV1/valorisation", json={"valeur": 10500.0, "date": "2026-02-01"})

    assert reponse.status_code == 200
    corps = reponse.json()
    assert corps["valeur_estimee"] == 10500.0
    assert corps["date_valeur_estimee"].startswith("2026-02-01")


def test_un_point_antidate_najamais_ecraser_une_valeur_plus_recente(client, db):
    """Cas verrouillé explicitement (backlog 2.S.1) : un rattrapage a posteriori
    (saisie tardive d'un mois passé) ne doit jamais corrompre la valeur "courante"
    déjà connue plus récente."""
    make_holding(db, ticker="AV1", type_actif="LIFE_INSURANCE")
    client.put("/api/portfolio/holdings/AV1/valorisation", json={"valeur": 10500.0, "date": "2026-03-01"})

    reponse = client.put("/api/portfolio/holdings/AV1/valorisation", json={"valeur": 9800.0, "date": "2026-01-15"})

    assert reponse.status_code == 200
    corps = reponse.json()
    # La valeur courante reste celle de mars, pas écrasée par le point de janvier.
    assert corps["valeur_estimee"] == 10500.0
    assert corps["date_valeur_estimee"].startswith("2026-03-01")
    # Mais le point antidaté est bien conservé dans l'historique complet, pas perdu.
    historique = client.get("/api/portfolio/holdings/AV1/immobilier-history").json()
    valeurs = sorted(p["valeur"] for p in historique)
    assert valeurs == [9800.0, 10500.0]


def test_valorisation_sur_ticker_introuvable_renvoie_404(client):
    reponse = client.put("/api/portfolio/holdings/INEXISTANT/valorisation", json={"valeur": 100.0, "date": "2026-01-01"})

    assert reponse.status_code == 404


def test_valorisation_sur_actif_dun_autre_utilisateur_est_refusee(client, db):
    basculer_utilisateur(db, ID_UTILISATEUR_B, NOM_UTILISATEUR_B)
    make_holding(db, ticker="AV_B", user_id=ID_UTILISATEUR_B, type_actif="LIFE_INSURANCE")
    basculer_utilisateur(db, ID_UTILISATEUR_TEST, NOM_UTILISATEUR_TEST)

    reponse = client.put("/api/portfolio/holdings/AV_B/valorisation", json={"valeur": 100.0, "date": "2026-01-01"})

    assert reponse.status_code == 404


def test_valeur_negative_est_rejetee(client, db):
    make_holding(db, ticker="AV1", type_actif="LIFE_INSURANCE")

    reponse = client.put("/api/portfolio/holdings/AV1/valorisation", json={"valeur": -100.0, "date": "2026-01-01"})

    assert reponse.status_code == 400


def test_date_mal_formee_est_rejetee(client, db):
    make_holding(db, ticker="AV1", type_actif="LIFE_INSURANCE")

    reponse = client.put("/api/portfolio/holdings/AV1/valorisation", json={"valeur": 100.0, "date": "15/01/2026"})

    assert reponse.status_code == 400


def test_creation_et_edition_classiques_gardent_datetime_now_inchange(client):
    """Non-régression : seule la nouvelle route `valorisation` accepte une date
    choisie — `create_holding`/`update_holding` continuent de stamper `datetime.now()`
    pour tout appelant qui ne passe pas par elle (comportement déjà couvert par
    `test_holding_immobilier.py`, revérifié ici pour un type Épargne)."""
    cree = client.post(
        "/api/portfolio/holdings",
        json={"ticker": "AV1", "quantite": 1, "type_actif": "LIFE_INSURANCE", "valeur_estimee": 5000.0},
    ).json()

    assert cree["date_valeur_estimee"] is not None
    historique = client.get("/api/portfolio/holdings/AV1/immobilier-history").json()
    assert len(historique) == 1
    assert historique[0]["valeur"] == 5000.0
