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


# --- Connexion SSO Authentik (OIDC applicatif) --------------------------------


def test_login_sur_compte_sans_mot_de_passe_renvoie_401_message_clair(client_reel, db_vide):
    from app.models import User

    db_vide.add(User(username="alice", password_hash=None, oidc_subject="sub-1"))
    db_vide.commit()

    reponse = client_reel.post("/api/auth/login", json={"username": "alice", "password": "peu importe"})

    assert reponse.status_code == 401
    assert "SSO" in reponse.json()["detail"]


def test_oidc_status_reflete_la_configuration(client_reel, db_vide, monkeypatch):
    assert client_reel.get("/api/auth/oidc/status").json() == {"enabled": False, "display_name": "SSO"}

    _configurer_oidc(db_vide, monkeypatch)

    assert client_reel.get("/api/auth/oidc/status").json() == {"enabled": True, "display_name": "SSO"}


def test_oidc_status_reflete_enabled_a_false_sans_effacer_la_config(client_reel, db_vide, monkeypatch):
    oidc_service = _configurer_oidc(db_vide, monkeypatch)
    assert client_reel.get("/api/auth/oidc/status").json()["enabled"] is True

    oidc_service.enregistrer_config(
        db_vide,
        issuer="https://authentik.example.com/application/o/patrimoine",
        client_id="client-abc",
        client_secret=None,
        redirect_uri="https://patrimoine.example.com/api/auth/oidc/callback",
        frontend_url="https://patrimoine.example.com",
        enabled=False,
    )

    assert client_reel.get("/api/auth/oidc/status").json() == {"enabled": False, "display_name": "SSO"}
    assert client_reel.get("/api/auth/oidc/login", follow_redirects=False).status_code == 404

    oidc_service.enregistrer_config(
        db_vide,
        issuer="https://authentik.example.com/application/o/patrimoine",
        client_id="client-abc",
        client_secret=None,
        redirect_uri="https://patrimoine.example.com/api/auth/oidc/callback",
        frontend_url="https://patrimoine.example.com",
        enabled=True,
    )
    assert client_reel.get("/api/auth/oidc/status").json()["enabled"] is True


def test_oidc_login_404_si_non_configure(client_reel):
    reponse = client_reel.get("/api/auth/oidc/login", follow_redirects=False)

    assert reponse.status_code == 404


def _configurer_oidc(db_vide, monkeypatch):
    from cryptography.fernet import Fernet

    from app.services import oidc_service

    monkeypatch.setenv(oidc_service.VARIABLE_CLE_CHIFFREMENT, Fernet.generate_key().decode("utf-8"))
    oidc_service.enregistrer_config(
        db_vide,
        issuer="https://authentik.example.com/application/o/patrimoine",
        client_id="client-abc",
        client_secret="secret-xyz",
        redirect_uri="https://patrimoine.example.com/api/auth/oidc/callback",
        frontend_url="https://patrimoine.example.com",
    )
    return oidc_service


def test_oidc_login_redirige_vers_authentik(client_reel, db_vide, monkeypatch):
    oidc_service = _configurer_oidc(db_vide, monkeypatch)
    monkeypatch.setattr(
        oidc_service,
        "_discovery",
        lambda issuer: {"authorization_endpoint": "https://authentik.example.com/application/o/patrimoine/authorize/"},
    )

    reponse = client_reel.get("/api/auth/oidc/login", follow_redirects=False)

    assert reponse.status_code in (302, 307)
    assert reponse.headers["location"].startswith("https://authentik.example.com/application/o/patrimoine/authorize/")


def test_oidc_callback_erreur_authentik_redirige_avec_message(client_reel, db_vide, monkeypatch):
    _configurer_oidc(db_vide, monkeypatch)

    reponse = client_reel.get("/api/auth/oidc/callback?error=access_denied", follow_redirects=False)

    assert reponse.status_code in (302, 307)
    assert "oidc_error=" in reponse.headers["location"]
    assert reponse.headers["location"].startswith("https://patrimoine.example.com/")


def test_oidc_callback_state_invalide_redirige_avec_message(client_reel, db_vide, monkeypatch):
    _configurer_oidc(db_vide, monkeypatch)

    reponse = client_reel.get("/api/auth/oidc/callback?code=abc&state=nimportequoi", follow_redirects=False)

    assert reponse.status_code in (302, 307)
    assert "oidc_error=" in reponse.headers["location"]


def test_oidc_callback_succes_cree_le_compte_et_redirige_avec_un_jeton(client_reel, db_vide, monkeypatch):
    oidc_service = _configurer_oidc(db_vide, monkeypatch)
    verifier, challenge = oidc_service.code_verifier_et_challenge()
    state = oidc_service.construire_state(verifier)
    monkeypatch.setattr(oidc_service, "echanger_code", lambda config, code, code_verifier: {"access_token": "at-123"})
    monkeypatch.setattr(
        oidc_service,
        "recuperer_identite",
        lambda config, access_token: {"sub": "sub-1", "preferred_username": "alice"},
    )

    reponse = client_reel.get(f"/api/auth/oidc/callback?code=un-code&state={state}", follow_redirects=False)

    assert reponse.status_code in (302, 307)
    location = reponse.headers["location"]
    assert location.startswith("https://patrimoine.example.com/#token=")
    jeton = location.split("#token=")[1]

    # Premier compte de la base : devient propriétaire (bootstrap), et le jeton émis
    # fonctionne réellement pour une requête protégée.
    moi = client_reel.get("/api/auth/me", headers={"Authorization": f"Bearer {jeton}"})
    assert moi.status_code == 200
    assert moi.json()["username"] == "alice"
    assert moi.json()["role"] == "proprietaire"


def test_oidc_callback_meme_identite_deux_fois_ne_duplique_pas_le_compte(client_reel, db_vide, monkeypatch):
    oidc_service = _configurer_oidc(db_vide, monkeypatch)
    monkeypatch.setattr(oidc_service, "echanger_code", lambda config, code, code_verifier: {"access_token": "at-123"})
    monkeypatch.setattr(
        oidc_service,
        "recuperer_identite",
        lambda config, access_token: {"sub": "sub-1", "preferred_username": "alice"},
    )

    def _connecter():
        verifier, _ = oidc_service.code_verifier_et_challenge()
        state = oidc_service.construire_state(verifier)
        return client_reel.get(f"/api/auth/oidc/callback?code=un-code&state={state}", follow_redirects=False)

    jeton_a = _connecter().headers["location"].split("#token=")[1]
    jeton_b = _connecter().headers["location"].split("#token=")[1]

    id_a = client_reel.get("/api/auth/me", headers={"Authorization": f"Bearer {jeton_a}"}).json()["id"]
    id_b = client_reel.get("/api/auth/me", headers={"Authorization": f"Bearer {jeton_b}"}).json()["id"]
    assert id_a == id_b


def test_oidc_callback_expose_email_et_nom_sur_me_et_household_members(client_reel, db_vide, monkeypatch):
    oidc_service = _configurer_oidc(db_vide, monkeypatch)
    monkeypatch.setattr(oidc_service, "echanger_code", lambda config, code, code_verifier: {"access_token": "at-123"})

    def _connecter(claims):
        verifier, _ = oidc_service.code_verifier_et_challenge()
        state = oidc_service.construire_state(verifier)
        monkeypatch.setattr(oidc_service, "recuperer_identite", lambda config, access_token: claims)
        reponse = client_reel.get(f"/api/auth/oidc/callback?code=un-code&state={state}", follow_redirects=False)
        return reponse.headers["location"].split("#token=")[1]

    # Premier compte OIDC : bootstrap propriétaire.
    jeton_proprietaire = _connecter(
        {"sub": "sub-paul", "preferred_username": "paul", "email": "paul@example.com", "name": "Paul"}
    )
    moi = client_reel.get("/api/auth/me", headers={"Authorization": f"Bearer {jeton_proprietaire}"}).json()
    assert moi["email"] == "paul@example.com"
    assert moi["nom"] == "Paul"

    # Second compte OIDC : membre rattaché au foyer, visible dans "Comptes du foyer"
    # avec son email/nom exposés.
    _connecter({"sub": "sub-dave", "preferred_username": "dave", "email": "dave@example.com", "name": "Dave Dupont"})

    membres = client_reel.get(
        "/api/auth/household-members", headers={"Authorization": f"Bearer {jeton_proprietaire}"}
    ).json()
    assert len(membres) == 1
    assert membres[0]["username"] == "dave"
    assert membres[0]["email"] == "dave@example.com"
    assert membres[0]["nom"] == "Dave Dupont"


# --- Administration de la configuration Authentik depuis Réglages ----------------


def _payload_config_oidc(**overrides):
    payload = {
        "issuer": "https://authentik.example.com/application/o/patrimoine",
        "client_id": "client-abc",
        "redirect_uri": "https://patrimoine.example.com/api/auth/oidc/callback",
        "frontend_url": "https://patrimoine.example.com",
        "client_secret": "secret-xyz",
    }
    payload.update(overrides)
    return payload


def test_get_oidc_config_refuse_a_un_non_proprietaire(client_reel):
    token_paul = _inscrire(client_reel).json()["token"]
    client_reel.post(
        "/api/auth/household-members",
        json={"username": "conjoint", "password": "mot-de-passe-solide", "role": "membre"},
        headers={"Authorization": f"Bearer {token_paul}"},
    )
    token_membre = client_reel.post("/api/auth/login", json={"username": "conjoint", "password": "mot-de-passe-solide"}).json()["token"]

    reponse = client_reel.get("/api/auth/oidc/config", headers={"Authorization": f"Bearer {token_membre}"})

    assert reponse.status_code == 403


def test_put_oidc_config_sans_cle_chiffrement_renvoie_400(client_reel, monkeypatch):
    from app.services import oidc_service

    monkeypatch.delenv(oidc_service.VARIABLE_CLE_CHIFFREMENT, raising=False)
    token_paul = _inscrire(client_reel).json()["token"]

    reponse = client_reel.put(
        "/api/auth/oidc/config", json=_payload_config_oidc(), headers={"Authorization": f"Bearer {token_paul}"}
    )

    assert reponse.status_code == 400
    assert "PATRIMOINE_SECRET_KEY" in reponse.json()["detail"]


def test_put_puis_get_oidc_config_ne_renvoie_jamais_le_secret(client_reel, monkeypatch):
    from cryptography.fernet import Fernet

    monkeypatch.setenv("PATRIMOINE_SECRET_KEY", Fernet.generate_key().decode("utf-8"))
    token_paul = _inscrire(client_reel).json()["token"]
    en_tete = {"Authorization": f"Bearer {token_paul}"}

    put_reponse = client_reel.put("/api/auth/oidc/config", json=_payload_config_oidc(), headers=en_tete)
    assert put_reponse.status_code == 200
    corps_put = put_reponse.json()
    assert corps_put["secret_configure"] is True
    assert "client_secret" not in corps_put
    assert "secret-xyz" not in put_reponse.text

    get_reponse = client_reel.get("/api/auth/oidc/config", headers=en_tete)
    assert get_reponse.status_code == 200
    assert get_reponse.json()["issuer"] == "https://authentik.example.com/application/o/patrimoine"
    assert "secret-xyz" not in get_reponse.text

    status_reponse = client_reel.get("/api/auth/oidc/status")
    assert status_reponse.json() == {"enabled": True, "display_name": "SSO"}


def test_put_oidc_config_sans_secret_conserve_le_secret_deja_enregistre(client_reel, monkeypatch):
    from cryptography.fernet import Fernet

    monkeypatch.setenv("PATRIMOINE_SECRET_KEY", Fernet.generate_key().decode("utf-8"))
    token_paul = _inscrire(client_reel).json()["token"]
    en_tete = {"Authorization": f"Bearer {token_paul}"}
    client_reel.put("/api/auth/oidc/config", json=_payload_config_oidc(), headers=en_tete)

    payload_sans_secret = _payload_config_oidc(frontend_url="https://autre.example.com")
    del payload_sans_secret["client_secret"]
    reponse = client_reel.put("/api/auth/oidc/config", json=payload_sans_secret, headers=en_tete)

    assert reponse.status_code == 200
    corps = reponse.json()
    assert corps["secret_configure"] is True
    assert corps["frontend_url"] == "https://autre.example.com"


def test_put_oidc_config_champ_vide_rejete(client_reel, monkeypatch):
    from cryptography.fernet import Fernet

    monkeypatch.setenv("PATRIMOINE_SECRET_KEY", Fernet.generate_key().decode("utf-8"))
    token_paul = _inscrire(client_reel).json()["token"]

    reponse = client_reel.put(
        "/api/auth/oidc/config", json=_payload_config_oidc(issuer=""), headers={"Authorization": f"Bearer {token_paul}"}
    )

    assert reponse.status_code == 400


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
