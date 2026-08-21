"""Verrouille `routers/auth.py` en conditions réelles (vraies requêtes HTTP, sans
l'override `get_current_user` de la fixture `client` — cf. `conftest.py`) : c'est le
seul fichier de la suite qui exerce le vrai comportement d'authentification (401 sans
jeton, jeton invalide/expiré, inscription/connexion/déconnexion). Vérifie aussi
qu'une route protégée quelconque (choisie ici : `GET /api/portfolio/holdings`) exige
bien un jeton — verrou central du Milestone 1."""

import os
import tempfile

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.auth import get_current_user
from app.database import Base, get_db
from app.main import app


@pytest.fixture
def db_vide():
    """Base de test STRICTEMENT vide (contrairement à la fixture `db` de
    `conftest.py`, qui pré-insère `ID_UTILISATEUR_TEST` comme toute première ligne)
    — indispensable ici : l'auto-inscription (2.L.2) n'est ouverte que pour créer le
    tout premier compte, un test qui hériterait d'un utilisateur déjà présent ne
    pourrait plus jamais s'inscrire."""
    fd, chemin = tempfile.mkstemp(prefix="patrimoine_test_auth_db_", suffix=".db")
    os.close(fd)
    engine_test = create_engine(f"sqlite:///{chemin}", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine_test)
    SessionLocalTest = sessionmaker(autocommit=False, autoflush=False, bind=engine_test)
    session = SessionLocalTest()
    try:
        yield session
    finally:
        session.close()
        engine_test.dispose()
        os.remove(chemin)


@pytest.fixture
def client_reel(db_vide):
    """Comme la fixture `client` de `conftest.py`, mais SANS basculer `get_current_user`
    — nécessaire ici pour tester le vrai comportement d'authentification plutôt que
    celui, court-circuité, utilisé par le reste de la suite. Base strictement vide
    (`db_vide`), pas celle de `conftest.py` qui pré-insère un utilisateur."""

    def _override_get_db():
        yield db_vide

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


def test_inscription_fermee_apres_le_premier_compte(client_reel):
    """L'auto-inscription (2.L.2) ne reste ouverte que pour créer le tout premier
    compte (bootstrap du propriétaire) — au-delà, même avec un nom d'utilisateur
    différent, elle est fermée : les comptes du foyer se créent ensuite exclusivement
    via `POST /household-members`, réservé au propriétaire."""
    _inscrire(client_reel)

    reponse = _inscrire(client_reel, username="quelquun-dautre")

    assert reponse.status_code == 403


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


# --- Verrouillage temporaire (2.L.2) ---------------------------------------


def test_connexion_verrouillee_apres_trop_de_tentatives(client_reel):
    from app.services import auth_service

    _inscrire(client_reel)
    for _ in range(auth_service.SEUIL_TENTATIVES):
        client_reel.post("/api/auth/login", json={"username": "paul", "password": "mauvais"})

    # Même avec le BON mot de passe, le compte reste verrouillé.
    reponse = client_reel.post("/api/auth/login", json={"username": "paul", "password": "mot-de-passe-solide"})

    assert reponse.status_code == 429


# --- Sessions (2.L.2) --------------------------------------------------------


def test_sessions_liste_plusieurs_connexions(client_reel):
    _inscrire(client_reel)
    token_a = client_reel.post("/api/auth/login", json={"username": "paul", "password": "mot-de-passe-solide"}).json()["token"]
    token_b = client_reel.post("/api/auth/login", json={"username": "paul", "password": "mot-de-passe-solide"}).json()["token"]

    reponse = client_reel.get("/api/auth/sessions", headers={"Authorization": f"Bearer {token_b}"})

    assert reponse.status_code == 200
    sessions = reponse.json()
    assert len(sessions) == 3  # inscription + 2 connexions
    courantes = [s for s in sessions if s["est_courante"]]
    assert len(courantes) == 1


def test_revoquer_une_session_ne_touche_pas_les_autres(client_reel):
    _inscrire(client_reel)
    token_a = client_reel.post("/api/auth/login", json={"username": "paul", "password": "mot-de-passe-solide"}).json()["token"]
    token_b = client_reel.post("/api/auth/login", json={"username": "paul", "password": "mot-de-passe-solide"}).json()["token"]

    sessions = client_reel.get("/api/auth/sessions", headers={"Authorization": f"Bearer {token_a}"}).json()
    id_session_a = next(s["id_session"] for s in sessions if s["est_courante"])

    reponse = client_reel.delete(f"/api/auth/sessions/{id_session_a}", headers={"Authorization": f"Bearer {token_b}"})
    assert reponse.status_code == 204

    assert client_reel.get("/api/auth/me", headers={"Authorization": f"Bearer {token_a}"}).status_code == 401
    assert client_reel.get("/api/auth/me", headers={"Authorization": f"Bearer {token_b}"}).status_code == 200


def test_revoquer_la_session_dun_autre_utilisateur_renvoie_404(client_reel):
    _inscrire(client_reel, username="paul")
    token_paul = client_reel.post("/api/auth/login", json={"username": "paul", "password": "mot-de-passe-solide"}).json()["token"]
    sessions_paul = client_reel.get("/api/auth/sessions", headers={"Authorization": f"Bearer {token_paul}"}).json()
    id_session_paul = sessions_paul[0]["id_session"]

    token_membre = client_reel.post(
        "/api/auth/household-members",
        json={"username": "membre", "password": "mot-de-passe-solide", "role": "membre"},
        headers={"Authorization": f"Bearer {token_paul}"},
    )
    token_membre_connexion = client_reel.post("/api/auth/login", json={"username": "membre", "password": "mot-de-passe-solide"}).json()["token"]

    reponse = client_reel.delete(f"/api/auth/sessions/{id_session_paul}", headers={"Authorization": f"Bearer {token_membre_connexion}"})

    assert reponse.status_code == 404


# --- Journal d'accès (2.L.2) --------------------------------------------------


def test_journal_acces_reserve_au_proprietaire(client_reel):
    _inscrire(client_reel)
    token_paul = client_reel.post("/api/auth/login", json={"username": "paul", "password": "mot-de-passe-solide"}).json()["token"]
    client_reel.post(
        "/api/auth/household-members",
        json={"username": "membre", "password": "mot-de-passe-solide", "role": "membre"},
        headers={"Authorization": f"Bearer {token_paul}"},
    )
    token_membre = client_reel.post("/api/auth/login", json={"username": "membre", "password": "mot-de-passe-solide"}).json()["token"]

    reponse_proprietaire = client_reel.get("/api/auth/access-log", headers={"Authorization": f"Bearer {token_paul}"})
    reponse_membre = client_reel.get("/api/auth/access-log", headers={"Authorization": f"Bearer {token_membre}"})

    assert reponse_proprietaire.status_code == 200
    entrees = reponse_proprietaire.json()
    assert any(e["username_saisi"] == "paul" and e["resultat"] == "succes" for e in entrees)
    assert reponse_membre.status_code == 403


def test_tentative_ratee_apparait_dans_le_journal(client_reel):
    _inscrire(client_reel)
    token = client_reel.post("/api/auth/login", json={"username": "paul", "password": "mot-de-passe-solide"}).json()["token"]
    client_reel.post("/api/auth/login", json={"username": "paul", "password": "mauvais"})

    entrees = client_reel.get("/api/auth/access-log", headers={"Authorization": f"Bearer {token}"}).json()

    assert any(e["resultat"] == "echec" and e["raison"] == "mot_de_passe_incorrect" for e in entrees)


# --- Gestion du foyer / rôles (2.L.2) ----------------------------------------


def test_creer_un_membre_du_foyer(client_reel):
    token_paul = _inscrire(client_reel).json()["token"]

    reponse = client_reel.post(
        "/api/auth/household-members",
        json={"username": "conjoint", "password": "mot-de-passe-solide", "role": "membre"},
        headers={"Authorization": f"Bearer {token_paul}"},
    )

    assert reponse.status_code == 200
    assert reponse.json()["role"] == "membre"

    connexion_membre = client_reel.post("/api/auth/login", json={"username": "conjoint", "password": "mot-de-passe-solide"})
    assert connexion_membre.status_code == 200


def test_creer_un_membre_du_foyer_refuse_a_un_non_proprietaire(client_reel):
    token_paul = _inscrire(client_reel).json()["token"]
    client_reel.post(
        "/api/auth/household-members",
        json={"username": "conjoint", "password": "mot-de-passe-solide", "role": "membre"},
        headers={"Authorization": f"Bearer {token_paul}"},
    )
    token_membre = client_reel.post("/api/auth/login", json={"username": "conjoint", "password": "mot-de-passe-solide"}).json()["token"]

    reponse = client_reel.post(
        "/api/auth/household-members",
        json={"username": "intrus", "password": "mot-de-passe-solide", "role": "membre"},
        headers={"Authorization": f"Bearer {token_membre}"},
    )

    assert reponse.status_code == 403
