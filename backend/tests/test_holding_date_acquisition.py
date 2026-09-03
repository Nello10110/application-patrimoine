"""Verrouille `Holding.date_acquisition` (retour utilisateur, 26/08/2026) : date
d'acquisition d'un bien (achat de l'appartement, souscription du contrat...) déclarée
par l'utilisateur — distincte de `created_at` (date de saisie de la ligne dans
l'application) et de `date_valeur_estimee` (date de dernière estimation)."""

from app.services import historique_cache

from .conftest import ID_UTILISATEUR_TEST


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
    reponse = client.post("/api/portfolio/holdings", json={"ticker": "AAPL", "quantite": 5, "compte_nom": "Compte Test"})

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


def test_update_de_la_date_acquisition_seule_invalide_le_cache_du_patrimoine(client, db):
    """Bug corrigé le 26/08/2026 (retour utilisateur : graphique du Tableau de bord
    figé après édition) : `date_acquisition` alimente le point d'ancrage de la série
    manuelle (`patrimoine_history_service._serie_holding_manuel`), mais seul un
    changement de `valeur_estimee` invalidait jusqu'ici le cache d'historique combiné
    (`historique_patrimoine:*`, valide 24h) — un changement de date seule laissait
    donc le graphique figé sur l'ancienne série jusqu'à expiration du cache."""
    cree = client.post(
        "/api/portfolio/holdings",
        json={"ticker": "MAISON", "quantite": 1, "type_actif": "REAL_ESTATE", "prix_revient_moyen": 200000, "valeur_estimee": 250000},
    ).json()
    cle = historique_cache.cle_historique_patrimoine(ID_UTILISATEUR_TEST)
    historique_cache.ecrire(db, cle, [{"date": "2024-01-01"}])

    reponse = client.patch(f"/api/portfolio/holdings/{cree['id']}", json={"date_acquisition": "2019-03-01"})

    assert reponse.status_code == 200
    assert historique_cache.lire(db, cle) is None


def test_update_du_prix_revient_moyen_seul_invalide_le_cache_du_patrimoine(client, db):
    """Même raisonnement que ci-dessus : `prix_revient_moyen` est la valeur portée par
    le point d'ancrage, un changement seul doit aussi invalider la série mise en cache."""
    cree = client.post(
        "/api/portfolio/holdings",
        json={
            "ticker": "MAISON",
            "quantite": 1,
            "type_actif": "REAL_ESTATE",
            "prix_revient_moyen": 200000,
            "valeur_estimee": 250000,
            "date_acquisition": "2019-03-01",
        },
    ).json()
    cle = historique_cache.cle_historique_patrimoine(ID_UTILISATEUR_TEST)
    historique_cache.ecrire(db, cle, [{"date": "2024-01-01"}])

    reponse = client.patch(f"/api/portfolio/holdings/{cree['id']}", json={"prix_revient_moyen": 210000})

    assert reponse.status_code == 200
    assert historique_cache.lire(db, cle) is None


def test_create_holding_avec_date_acquisition_invalide_le_cache_du_patrimoine(client, db):
    """Même correctif côté création : une ligne créée directement avec une date
    d'acquisition (sans `valeur_estimee`, ex. un actif financier saisi manuellement
    avec un coût d'acquisition connu) doit aussi invalider un cache déjà existant."""
    cle = historique_cache.cle_historique_patrimoine(ID_UTILISATEUR_TEST)
    historique_cache.ecrire(db, cle, [{"date": "2024-01-01"}])

    reponse = client.post(
        "/api/portfolio/holdings",
        json={
            "ticker": "MAISON",
            "quantite": 1,
            "type_actif": "REAL_ESTATE",
            "prix_revient_moyen": 200000,
            "date_acquisition": "2019-03-01",
        },
    )

    assert reponse.status_code == 200
    assert historique_cache.lire(db, cle) is None


def test_update_dun_autre_champ_ninvalide_pas_le_cache_du_patrimoine(client, db):
    """Garde-fou inverse : un changement sans rapport (nom) ne doit pas déclencher un
    recalcul inutile de l'historique combiné à chaque modification de la ligne."""
    cree = client.post(
        "/api/portfolio/holdings",
        json={"ticker": "MAISON", "quantite": 1, "type_actif": "REAL_ESTATE", "valeur_estimee": 250000, "date_acquisition": "2019-03-01"},
    ).json()
    cle = historique_cache.cle_historique_patrimoine(ID_UTILISATEUR_TEST)
    historique_cache.ecrire(db, cle, [{"date": "2024-01-01"}])

    reponse = client.patch(f"/api/portfolio/holdings/{cree['id']}", json={"nom": "Résidence principale"})

    assert reponse.status_code == 200
    assert historique_cache.lire(db, cle) is not None
