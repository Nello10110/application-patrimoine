"""Verrouille `routers/auth.py` en conditions réelles (vraies requêtes HTTP, sans
l'override `get_current_user` de la fixture `client` — cf. `conftest.py`) : c'est le
seul fichier de la suite qui exerce le vrai comportement d'authentification (401 sans
jeton, jeton invalide/expiré, inscription/connexion/déconnexion). Vérifie aussi
qu'une route protégée quelconque (choisie ici : `GET /api/portfolio/holdings`) exige
bien un jeton — verrou central du Milestone 1."""

import pytest
from fastapi.testclient import TestClient

from app.auth import get_current_user
from app.database import get_db
from app.main import app


@pytest.fixture
def client_reel(db):
    """Comme la fixture `client` de `conftest.py`, mais SANS basculer `get_current_user`
    — nécessaire ici pour tester le vrai comportement d'authentification plutôt que
    celui, court-circuité, utilisé par le reste de la suite."""

    def _override_get_db():
        yield db

    app.dependency_overrides[get_db] = _override_get_db
    try:
        with TestClient(app) as test_client:
            yield test_client
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_user, None)


def _inscrire(client_reel, username="paul", password="mot-de-passe-solide"):
    return client_reel.post("/api/auth/register", json={"username": username, "password": password})


def test_inscription_cree_un_compte_et_renvoie_un_jeton(client_reel):
    reponse = _inscrire(client_reel)

    assert reponse.status_code == 200
    corps = reponse.json()
    assert corps["user"]["username"] == "paul"
    assert corps["token"]


def test_inscription_nom_utilisateur_deja_utilise_renvoie_400(client_reel):
    _inscrire(client_reel)

    reponse = _inscrire(client_reel)

    assert reponse.status_code == 400


def test_inscription_mot_de_passe_trop_court_renvoie_400(client_reel):
    reponse = client_reel.post("/api/auth/register", json={"username": "paul", "password": "court"})

    assert reponse.status_code == 400


def test_connexion_bons_identifiants(client_reel):
    _inscrire(client_reel)

    reponse = client_reel.post("/api/auth/login", json={"username": "paul", "password": "mot-de-passe-solide"})

    assert reponse.status_code == 200
    assert reponse.json()["token"]


def test_connexion_mauvais_mot_de_passe_renvoie_401(client_reel):
    _inscrire(client_reel)

    reponse = client_reel.post("/api/auth/login", json={"username": "paul", "password": "mauvais"})

    assert reponse.status_code == 401


def test_connexion_nom_utilisateur_inconnu_renvoie_401(client_reel):
    reponse = client_reel.post("/api/auth/login", json={"username": "inconnu", "password": "peu importe"})

    assert reponse.status_code == 401


def test_me_sans_jeton_renvoie_401(client_reel):
    reponse = client_reel.get("/api/auth/me")

    assert reponse.status_code == 401


def test_me_avec_jeton_invalide_renvoie_401(client_reel):
    reponse = client_reel.get("/api/auth/me", headers={"Authorization": "Bearer jeton-inexistant"})

    assert reponse.status_code == 401


def test_me_avec_jeton_valide_renvoie_lutilisateur(client_reel):
    token = _inscrire(client_reel).json()["token"]

    reponse = client_reel.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})

    assert reponse.status_code == 200
    assert reponse.json()["username"] == "paul"


def test_logout_revoque_le_jeton(client_reel):
    token = _inscrire(client_reel).json()["token"]
    en_tete = {"Authorization": f"Bearer {token}"}

    deconnexion = client_reel.post("/api/auth/logout", headers=en_tete)
    assert deconnexion.status_code == 204

    apres = client_reel.get("/api/auth/me", headers=en_tete)
    assert apres.status_code == 401


def test_route_protegee_sans_jeton_renvoie_401(client_reel):
    """`GET /api/portfolio/holdings` n'a rien à voir avec l'authentification elle-même
    — c'est exactement le point : n'importe quelle route existante doit désormais
    exiger un jeton, cf. `dependencies=[Depends(get_current_user)]` dans `main.py`."""
    reponse = client_reel.get("/api/portfolio/holdings")

    assert reponse.status_code == 401


def test_route_protegee_avec_jeton_valide_fonctionne(client_reel):
    token = _inscrire(client_reel).json()["token"]

    reponse = client_reel.get("/api/portfolio/holdings", headers={"Authorization": f"Bearer {token}"})

    assert reponse.status_code == 200
