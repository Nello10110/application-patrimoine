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


# --- Assistant de configuration initiale / welcome board ----------------------


def test_onboarding_termine_faux_a_linscription(client_reel):
    reponse = _inscrire(client_reel)

    assert reponse.json()["user"]["onboarding_termine"] is False


def test_onboarding_termine_faux_a_la_connexion(client_reel):
    _inscrire(client_reel)

    reponse = client_reel.post("/api/auth/login", json={"username": "paul", "password": "mot-de-passe-solide"})

    assert reponse.json()["user"]["onboarding_termine"] is False


def test_terminer_onboarding_marque_le_drapeau(client_reel):
    token = _inscrire(client_reel).json()["token"]
    en_tete = {"Authorization": f"Bearer {token}"}

    reponse = client_reel.post("/api/auth/onboarding/terminer", headers=en_tete)

    assert reponse.status_code == 200
    assert reponse.json()["onboarding_termine"] is True
    # Persisté : une relecture ultérieure (`/me`) le confirme, pas seulement la
    # réponse immédiate de l'endpoint qui vient de le poser.
    assert client_reel.get("/api/auth/me", headers=en_tete).json()["onboarding_termine"] is True


def test_terminer_onboarding_est_idempotent(client_reel):
    token = _inscrire(client_reel).json()["token"]
    en_tete = {"Authorization": f"Bearer {token}"}

    premier_appel = client_reel.post("/api/auth/onboarding/terminer", headers=en_tete)
    second_appel = client_reel.post("/api/auth/onboarding/terminer", headers=en_tete)

    assert premier_appel.status_code == 200
    assert second_appel.status_code == 200
    assert second_appel.json()["onboarding_termine"] is True


def test_terminer_onboarding_sans_jeton_renvoie_401(client_reel):
    reponse = client_reel.post("/api/auth/onboarding/terminer")

    assert reponse.status_code == 401


# --- Connexion SSO Authentik (OIDC applicatif) --------------------------------


def test_login_sur_compte_sans_mot_de_passe_renvoie_401_message_clair(client_reel, db_vide):
    from app.models import User

    db_vide.add(User(username="alice", password_hash=None, oidc_subject="sub-1"))
    db_vide.commit()

    reponse = client_reel.post("/api/auth/login", json={"username": "alice", "password": "peu importe"})

    assert reponse.status_code == 401
    assert "SSO" in reponse.json()["detail"]


def test_oidc_status_reflete_la_configuration(client_reel, monkeypatch):
    assert client_reel.get("/api/auth/oidc/status").json() == {"enabled": False, "display_name": "SSO"}

    _configurer_oidc(monkeypatch)

    assert client_reel.get("/api/auth/oidc/status").json() == {"enabled": True, "display_name": "SSO"}


def test_oidc_status_reflete_enabled_a_false_sans_effacer_la_config(client_reel, monkeypatch):
    from app.services import oidc_service

    _configurer_oidc(monkeypatch)
    assert client_reel.get("/api/auth/oidc/status").json()["enabled"] is True

    monkeypatch.setenv(oidc_service.VARIABLE_ENABLED, "false")

    assert client_reel.get("/api/auth/oidc/status").json() == {"enabled": False, "display_name": "SSO"}
    assert client_reel.get("/api/auth/oidc/login", follow_redirects=False).status_code == 404

    monkeypatch.setenv(oidc_service.VARIABLE_ENABLED, "true")
    assert client_reel.get("/api/auth/oidc/status").json()["enabled"] is True


def test_oidc_login_404_si_non_configure(client_reel):
    reponse = client_reel.get("/api/auth/oidc/login", follow_redirects=False)

    assert reponse.status_code == 404


def _configurer_oidc(monkeypatch):
    from app.services import oidc_service

    monkeypatch.setenv(oidc_service.VARIABLE_ENABLED, "true")
    monkeypatch.setenv(oidc_service.VARIABLE_ISSUER, "https://authentik.example.com/application/o/patrimoine")
    monkeypatch.setenv(oidc_service.VARIABLE_CLIENT_ID, "client-abc")
    monkeypatch.setenv(oidc_service.VARIABLE_CLIENT_SECRET, "secret-xyz")
    monkeypatch.setenv(oidc_service.VARIABLE_REDIRECT_URI, "https://patrimoine.example.com/api/auth/oidc/callback")
    monkeypatch.setenv(oidc_service.VARIABLE_FRONTEND_URL, "https://patrimoine.example.com")
    return oidc_service


def test_oidc_login_redirige_vers_authentik(client_reel, monkeypatch):
    oidc_service = _configurer_oidc(monkeypatch)
    monkeypatch.setattr(
        oidc_service,
        "_discovery",
        lambda issuer: {"authorization_endpoint": "https://authentik.example.com/application/o/patrimoine/authorize/"},
    )

    reponse = client_reel.get("/api/auth/oidc/login", follow_redirects=False)

    assert reponse.status_code in (302, 307)
    assert reponse.headers["location"].startswith("https://authentik.example.com/application/o/patrimoine/authorize/")


def test_oidc_callback_erreur_authentik_redirige_avec_message(client_reel, monkeypatch):
    _configurer_oidc(monkeypatch)

    reponse = client_reel.get("/api/auth/oidc/callback?error=access_denied", follow_redirects=False)

    assert reponse.status_code in (302, 307)
    assert "oidc_error=" in reponse.headers["location"]
    assert reponse.headers["location"].startswith("https://patrimoine.example.com/")


def test_oidc_callback_state_invalide_redirige_avec_message(client_reel, monkeypatch):
    _configurer_oidc(monkeypatch)

    reponse = client_reel.get("/api/auth/oidc/callback?code=abc&state=nimportequoi", follow_redirects=False)

    assert reponse.status_code in (302, 307)
    assert "oidc_error=" in reponse.headers["location"]


def test_oidc_callback_succes_cree_le_compte_et_redirige_avec_un_jeton(client_reel, db_vide, monkeypatch):
    oidc_service = _configurer_oidc(monkeypatch)
    verifier, challenge = oidc_service.code_verifier_et_challenge()
    state = oidc_service.construire_state(verifier, "secret-xyz")
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
    oidc_service = _configurer_oidc(monkeypatch)
    monkeypatch.setattr(oidc_service, "echanger_code", lambda config, code, code_verifier: {"access_token": "at-123"})
    monkeypatch.setattr(
        oidc_service,
        "recuperer_identite",
        lambda config, access_token: {"sub": "sub-1", "preferred_username": "alice"},
    )

    def _connecter():
        verifier, _ = oidc_service.code_verifier_et_challenge()
        state = oidc_service.construire_state(verifier, "secret-xyz")
        return client_reel.get(f"/api/auth/oidc/callback?code=un-code&state={state}", follow_redirects=False)

    jeton_a = _connecter().headers["location"].split("#token=")[1]
    jeton_b = _connecter().headers["location"].split("#token=")[1]

    id_a = client_reel.get("/api/auth/me", headers={"Authorization": f"Bearer {jeton_a}"}).json()["id"]
    id_b = client_reel.get("/api/auth/me", headers={"Authorization": f"Bearer {jeton_b}"}).json()["id"]
    assert id_a == id_b


def test_oidc_callback_expose_email_et_nom_sur_me_et_household_members(client_reel, db_vide, monkeypatch):
    oidc_service = _configurer_oidc(monkeypatch)
    monkeypatch.setattr(oidc_service, "echanger_code", lambda config, code, code_verifier: {"access_token": "at-123"})

    def _connecter(claims):
        verifier, _ = oidc_service.code_verifier_et_challenge()
        state = oidc_service.construire_state(verifier, "secret-xyz")
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
    # Le propriétaire (paul) apparaît aussi désormais, en première position (revue du
    # 04/09/2026) — on cible dave explicitement plutôt qu'un index fixe.
    assert len(membres) == 2
    dave = next(m for m in membres if m["username"] == "dave")
    assert dave["email"] == "dave@example.com"
    assert dave["nom"] == "Dave Dupont"


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


def test_supprimer_un_membre_conserve_son_journal_sans_reference_pendante(client_reel, db_vide):
    """Revue du 03/09/2026 : `delete_household_member` nettoyait les jetons et le
    périmètre, mais laissait `access_log_entries.user_id` pointer vers un compte
    disparu — 10 entrées orphelines constatées en base réelle
    (`PRAGMA foreign_key_check`).

    Les deux moitiés comptent : le journal doit SURVIVRE (c'est sa raison d'être,
    cf. docstring d'`AccessLogEntry`) et la référence ne doit PAS rester pendante."""
    from app.models import AccessLogEntry

    _inscrire(client_reel)
    token_paul = client_reel.post("/api/auth/login", json={"username": "paul", "password": "mot-de-passe-solide"}).json()["token"]
    entete = {"Authorization": f"Bearer {token_paul}"}
    membre = client_reel.post(
        "/api/auth/household-members",
        json={"username": "membre", "password": "mot-de-passe-solide", "role": "membre"},
        headers=entete,
    ).json()
    client_reel.post("/api/auth/login", json={"username": "membre", "password": "mot-de-passe-solide"})

    assert client_reel.delete(f"/api/auth/household-members/{membre['id']}", headers=entete).status_code == 204

    entrees = client_reel.get("/api/auth/access-log", headers=entete).json()
    tracees = [e for e in entrees if e["username_saisi"] == "membre"]
    assert tracees, "le journal d'accès doit survivre à la suppression du compte"

    assert db_vide.query(AccessLogEntry).filter(AccessLogEntry.user_id == membre["id"]).count() == 0, (
        "aucune entrée ne doit conserver une référence vers le compte supprimé"
    )


# --- Écran d'administration des comptes (revue du 04/09/2026) ----------------------
#
# Origine locale/SSO + nom du fournisseur, dernière connexion réussie, nombre de
# sessions actives, verrouillage en cours, et rôle éditable — cf.
# `HouseholdMemberOut`/`HouseholdMemberRoleUpdate` (schemas/authentification.py) et
# `_household_member_out` (routers/auth.py).


def test_liste_des_membres_signale_un_compte_local(client_reel):
    token_paul = _inscrire(client_reel).json()["token"]
    client_reel.post(
        "/api/auth/household-members",
        json={"username": "conjoint", "password": "mot-de-passe-solide", "role": "membre"},
        headers={"Authorization": f"Bearer {token_paul}"},
    )

    membres = client_reel.get("/api/auth/household-members", headers={"Authorization": f"Bearer {token_paul}"}).json()
    conjoint = next(m for m in membres if m["username"] == "conjoint")

    assert conjoint["oidc_display_name"] is None
    assert conjoint["derniere_connexion"] is None
    assert conjoint["sessions_actives"] == 0
    assert conjoint["verrouille_jusqua"] is None


def test_liste_des_membres_signale_un_compte_provisionne_par_oidc(client_reel, db_vide, monkeypatch):
    oidc_service = _configurer_oidc(monkeypatch)
    monkeypatch.setenv(oidc_service.VARIABLE_DISPLAY_NAME, "Authentik")
    monkeypatch.setattr(oidc_service, "echanger_code", lambda config, code, code_verifier: {"access_token": "at-123"})
    monkeypatch.setattr(oidc_service, "recuperer_identite", lambda config, access_token: {"sub": "sub-1", "preferred_username": "alice"})

    verifier, _ = oidc_service.code_verifier_et_challenge()
    state = oidc_service.construire_state(verifier, "secret-xyz")
    jeton_proprietaire = client_reel.get(
        f"/api/auth/oidc/callback?code=un-code&state={state}", follow_redirects=False
    ).headers["location"].split("#token=")[1]

    membres = client_reel.get(
        "/api/auth/household-members", headers={"Authorization": f"Bearer {jeton_proprietaire}"}
    ).json()

    # Premier compte OIDC : devient propriétaire (bootstrap) — il apparaît lui-même
    # dans sa propre liste (revue du 04/09/2026, écran d'administration des comptes),
    # provisionné via SSO comme n'importe quel autre. Aucun autre membre pour l'instant.
    assert len(membres) == 1
    assert membres[0]["username"] == "alice"
    assert membres[0]["role"] == "proprietaire"
    assert membres[0]["oidc_display_name"] == "Authentik"

    monkeypatch.setattr(oidc_service, "recuperer_identite", lambda config, access_token: {"sub": "sub-2", "preferred_username": "bob"})
    verifier2, _ = oidc_service.code_verifier_et_challenge()
    state2 = oidc_service.construire_state(verifier2, "secret-xyz")
    client_reel.get(f"/api/auth/oidc/callback?code=un-code&state={state2}", follow_redirects=False)

    membres = client_reel.get(
        "/api/auth/household-members", headers={"Authorization": f"Bearer {jeton_proprietaire}"}
    ).json()

    assert len(membres) == 2
    bob = next(m for m in membres if m["username"] == "bob")
    assert bob["oidc_display_name"] == "Authentik"


def test_liste_des_membres_reflete_la_derniere_connexion_reussie(client_reel):
    token_paul = _inscrire(client_reel).json()["token"]
    client_reel.post(
        "/api/auth/household-members",
        json={"username": "conjoint", "password": "mot-de-passe-solide", "role": "membre"},
        headers={"Authorization": f"Bearer {token_paul}"},
    )

    client_reel.post("/api/auth/login", json={"username": "conjoint", "password": "mot-de-passe-solide"})

    membres = client_reel.get("/api/auth/household-members", headers={"Authorization": f"Bearer {token_paul}"}).json()
    conjoint = next(m for m in membres if m["username"] == "conjoint")

    assert conjoint["derniere_connexion"] is not None
    assert conjoint["sessions_actives"] == 1


def test_liste_des_membres_reflete_un_verrouillage_en_cours(client_reel):
    from app.services import auth_service

    token_paul = _inscrire(client_reel).json()["token"]
    client_reel.post(
        "/api/auth/household-members",
        json={"username": "conjoint", "password": "mot-de-passe-solide", "role": "membre"},
        headers={"Authorization": f"Bearer {token_paul}"},
    )
    for _ in range(auth_service.SEUIL_TENTATIVES):
        client_reel.post("/api/auth/login", json={"username": "conjoint", "password": "mauvais-mot-de-passe"})

    membres = client_reel.get("/api/auth/household-members", headers={"Authorization": f"Bearer {token_paul}"}).json()
    conjoint = next(m for m in membres if m["username"] == "conjoint")

    assert conjoint["verrouille_jusqua"] is not None


def test_modifier_le_role_dun_membre_fonctionne(client_reel):
    token_paul = _inscrire(client_reel).json()["token"]
    entete = {"Authorization": f"Bearer {token_paul}"}
    membre = client_reel.post(
        "/api/auth/household-members",
        json={"username": "conjoint", "password": "mot-de-passe-solide", "role": "membre"},
        headers=entete,
    ).json()
    assert membre["role"] == "membre"

    reponse = client_reel.patch(f"/api/auth/household-members/{membre['id']}", json={"role": "invite"}, headers=entete)

    assert reponse.status_code == 200
    assert reponse.json()["role"] == "invite"
    membres = client_reel.get("/api/auth/household-members", headers=entete).json()
    conjoint = next(m for m in membres if m["username"] == "conjoint")
    assert conjoint["role"] == "invite"


def test_modifier_le_role_avec_une_valeur_invalide_est_refuse(client_reel):
    token_paul = _inscrire(client_reel).json()["token"]
    entete = {"Authorization": f"Bearer {token_paul}"}
    membre = client_reel.post(
        "/api/auth/household-members",
        json={"username": "conjoint", "password": "mot-de-passe-solide", "role": "membre"},
        headers=entete,
    ).json()

    reponse = client_reel.patch(f"/api/auth/household-members/{membre['id']}", json={"role": "proprietaire"}, headers=entete)

    # Le gestionnaire d'erreurs global (`main.py`) fait remonter les `ValueError` des
    # validateurs Pydantic en 400 (message français), pas le 422 par défaut de
    # FastAPI — même comportement que la création (`HouseholdMemberCreate`).
    assert reponse.status_code == 400


def test_modifier_le_role_refuse_a_un_non_proprietaire(client_reel):
    token_paul = _inscrire(client_reel).json()["token"]
    entete_paul = {"Authorization": f"Bearer {token_paul}"}
    membre = client_reel.post(
        "/api/auth/household-members",
        json={"username": "conjoint", "password": "mot-de-passe-solide", "role": "membre"},
        headers=entete_paul,
    ).json()
    token_membre = client_reel.post("/api/auth/login", json={"username": "conjoint", "password": "mot-de-passe-solide"}).json()["token"]

    reponse = client_reel.patch(
        f"/api/auth/household-members/{membre['id']}",
        json={"role": "invite"},
        headers={"Authorization": f"Bearer {token_membre}"},
    )

    assert reponse.status_code == 403


def test_modifier_le_role_dun_membre_dun_autre_foyer_renvoie_404(client_reel, db_vide):
    from app.services import auth_service as auth_service_module

    token_paul = _inscrire(client_reel, username="paul").json()["token"]
    membre_paul = client_reel.post(
        "/api/auth/household-members",
        json={"username": "conjoint-paul", "password": "mot-de-passe-solide", "role": "membre"},
        headers={"Authorization": f"Bearer {token_paul}"},
    ).json()

    # Second foyer : `/register` se ferme après le tout premier compte (cf.
    # docstring de `register`) — on crée directement ce second propriétaire via le
    # service, comme le ferait un second déploiement/onboarding.
    auth_service_module.creer_utilisateur(db_vide, "alice-intruse", "mot-de-passe-solide")
    token_alice = client_reel.post(
        "/api/auth/login", json={"username": "alice-intruse", "password": "mot-de-passe-solide"}
    ).json()["token"]

    reponse = client_reel.patch(
        f"/api/auth/household-members/{membre_paul['id']}",
        json={"role": "invite"},
        headers={"Authorization": f"Bearer {token_alice}"},
    )

    assert reponse.status_code == 404
