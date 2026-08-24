"""Verrouille `services/oidc_service.py` (connexion SSO Authentik) : signature/
fraîcheur du `state` anti-CSRF, dérivation PKCE, mise en cache de la découverte
OIDC, échange de code/récupération d'identité (réseau neutralisé via monkeypatch de
`requests`), et surtout la résolution/provisioning de compte — le cœur métier du
flux, à ne jamais laisser un utilisateur Authentik obtenir un rôle plus privilégié
que celui prévu par design."""

import time
from urllib.parse import parse_qs, urlparse

import pytest

from app.models import ROLE_MEMBRE, ROLE_PROPRIETAIRE, User
from app.services import oidc_service
from tests.conftest import ID_UTILISATEUR_TEST


@pytest.fixture(autouse=True)
def isoler_cache_decouverte():
    """Le cache de découverte OIDC est module-level (par design, cf. docstring de
    `oidc_service._discovery`) — le réinitialiser entre chaque test pour qu'aucun
    test n'hérite d'une réponse mise en cache par un test précédent."""
    oidc_service._discovery_cache = None
    yield
    oidc_service._discovery_cache = None


@pytest.fixture
def config_oidc(monkeypatch):
    monkeypatch.setenv(oidc_service.VAR_ISSUER, "https://authentik.example.com/application/o/patrimoine")
    monkeypatch.setenv(oidc_service.VAR_CLIENT_ID, "client-abc")
    monkeypatch.setenv(oidc_service.VAR_CLIENT_SECRET, "secret-xyz")
    monkeypatch.setenv(oidc_service.VAR_REDIRECT_URI, "https://patrimoine.example.com/api/auth/oidc/callback")
    monkeypatch.setenv(oidc_service.VAR_FRONTEND_URL, "https://patrimoine.example.com")


class FausseReponse:
    def __init__(self, status_code=200, json_data=None):
        self.status_code = status_code
        self._json = json_data or {}

    def json(self):
        return self._json

    def raise_for_status(self):
        if self.status_code != 200:
            raise RuntimeError(f"statut {self.status_code}")


DECOUVERTE = {
    "authorization_endpoint": "https://authentik.example.com/application/o/patrimoine/authorize/",
    "token_endpoint": "https://authentik.example.com/application/o/patrimoine/token/",
    "userinfo_endpoint": "https://authentik.example.com/application/o/patrimoine/userinfo/",
}


# --- Configuration -----------------------------------------------------------


def test_enabled_faux_si_une_seule_variable_manque(config_oidc, monkeypatch):
    monkeypatch.delenv(oidc_service.VAR_CLIENT_SECRET, raising=False)

    assert oidc_service.enabled() is False


def test_enabled_vrai_si_les_5_variables_sont_definies(config_oidc):
    assert oidc_service.enabled() is True


# --- PKCE ----------------------------------------------------------------------


def test_code_verifier_et_challenge_sont_coherents():
    import base64
    import hashlib

    verifier, challenge = oidc_service.code_verifier_et_challenge()

    attendu = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode("ascii")).digest()).rstrip(b"=").decode("ascii")
    assert challenge == attendu
    assert "=" not in challenge  # PKCE S256 : jamais de padding dans le challenge


# --- State anti-CSRF -------------------------------------------------------------


def test_state_valide_fait_laller_retour(config_oidc):
    verifier, _ = oidc_service.code_verifier_et_challenge()
    state = oidc_service.construire_state(verifier)

    assert oidc_service.verifier_state(state) == verifier


def test_state_altere_est_rejete(config_oidc):
    verifier, _ = oidc_service.code_verifier_et_challenge()
    state = oidc_service.construire_state(verifier)
    altere = state[:-1] + ("0" if state[-1] != "0" else "1")

    with pytest.raises(oidc_service.OidcError):
        oidc_service.verifier_state(altere)


def test_state_malforme_est_rejete(config_oidc):
    with pytest.raises(oidc_service.OidcError):
        oidc_service.verifier_state("nimportequoi")


def test_state_expire_est_rejete(config_oidc, monkeypatch):
    verifier, _ = oidc_service.code_verifier_et_challenge()
    state = oidc_service.construire_state(verifier)

    plus_tard = time.time() + oidc_service.STATE_TTL_SECONDES + 60
    monkeypatch.setattr(oidc_service.time, "time", lambda: plus_tard)

    with pytest.raises(oidc_service.OidcError):
        oidc_service.verifier_state(state)


# --- Découverte OIDC (mise en cache) ----------------------------------------------


def test_decouverte_mise_en_cache(config_oidc, monkeypatch):
    appels = []

    def faux_get(url, timeout=None):
        appels.append(url)
        return FausseReponse(200, DECOUVERTE)

    monkeypatch.setattr(oidc_service.requests, "get", faux_get)

    oidc_service._discovery()
    oidc_service._discovery()

    assert len(appels) == 1
    assert appels[0] == "https://authentik.example.com/application/o/patrimoine/.well-known/openid-configuration"


def test_url_autorisation_contient_les_bons_parametres(config_oidc, monkeypatch):
    monkeypatch.setattr(oidc_service.requests, "get", lambda url, timeout=None: FausseReponse(200, DECOUVERTE))

    url = oidc_service.url_autorisation("mon-state", "mon-challenge")

    base = urlparse(url)
    params = parse_qs(base.query)
    assert base.scheme + "://" + base.netloc + base.path == DECOUVERTE["authorization_endpoint"]
    assert params["response_type"] == ["code"]
    assert params["client_id"] == ["client-abc"]
    assert params["redirect_uri"] == ["https://patrimoine.example.com/api/auth/oidc/callback"]
    assert params["state"] == ["mon-state"]
    assert params["code_challenge"] == ["mon-challenge"]
    assert params["code_challenge_method"] == ["S256"]


# --- Échange de code / récupération d'identité --------------------------------------


def test_echanger_code_succes(config_oidc, monkeypatch):
    monkeypatch.setattr(oidc_service.requests, "get", lambda url, timeout=None: FausseReponse(200, DECOUVERTE))
    monkeypatch.setattr(oidc_service.requests, "post", lambda url, data=None, timeout=None: FausseReponse(200, {"access_token": "at-123"}))

    resultat = oidc_service.echanger_code("un-code", "un-verifier")

    assert resultat["access_token"] == "at-123"


def test_echanger_code_statut_non_200_leve(config_oidc, monkeypatch):
    monkeypatch.setattr(oidc_service.requests, "get", lambda url, timeout=None: FausseReponse(200, DECOUVERTE))
    monkeypatch.setattr(oidc_service.requests, "post", lambda url, data=None, timeout=None: FausseReponse(400, {"error": "invalid_grant"}))

    with pytest.raises(oidc_service.OidcError):
        oidc_service.echanger_code("un-code", "un-verifier")


def test_echanger_code_sans_access_token_leve(config_oidc, monkeypatch):
    monkeypatch.setattr(oidc_service.requests, "get", lambda url, timeout=None: FausseReponse(200, DECOUVERTE))
    monkeypatch.setattr(oidc_service.requests, "post", lambda url, data=None, timeout=None: FausseReponse(200, {}))

    with pytest.raises(oidc_service.OidcError):
        oidc_service.echanger_code("un-code", "un-verifier")


def test_recuperer_identite_succes(config_oidc, monkeypatch):
    appels = {}

    def faux_get(url, headers=None, timeout=None):
        if "userinfo" in url:
            appels["headers"] = headers
            return FausseReponse(200, {"sub": "sub-123", "preferred_username": "alice", "email": "alice@example.com"})
        return FausseReponse(200, DECOUVERTE)

    monkeypatch.setattr(oidc_service.requests, "get", faux_get)

    claims = oidc_service.recuperer_identite("at-123")

    assert claims["sub"] == "sub-123"
    assert appels["headers"]["Authorization"] == "Bearer at-123"


def test_recuperer_identite_statut_non_200_leve(config_oidc, monkeypatch):
    def faux_get(url, headers=None, timeout=None):
        if "userinfo" in url:
            return FausseReponse(403, {})
        return FausseReponse(200, DECOUVERTE)

    monkeypatch.setattr(oidc_service.requests, "get", faux_get)

    with pytest.raises(oidc_service.OidcError):
        oidc_service.recuperer_identite("at-123")


def test_recuperer_identite_sans_sub_leve(config_oidc, monkeypatch):
    def faux_get(url, headers=None, timeout=None):
        if "userinfo" in url:
            return FausseReponse(200, {"preferred_username": "alice"})
        return FausseReponse(200, DECOUVERTE)

    monkeypatch.setattr(oidc_service.requests, "get", faux_get)

    with pytest.raises(oidc_service.OidcError):
        oidc_service.recuperer_identite("at-123")


# --- Résolution / provisioning de compte ------------------------------------------


@pytest.fixture
def db_vide(db):
    """La fixture `db` de `conftest.py` pré-insère `ID_UTILISATEUR_TEST` comme toute
    première ligne — indispensable de repartir d'une base STRICTEMENT vide ici pour
    exercer la branche bootstrap (`db.query(User).count() == 0`)."""
    db.query(User).filter(User.id == ID_UTILISATEUR_TEST).delete()
    db.commit()
    return db


def test_oidc_subject_deja_lie_renvoie_le_meme_compte(db_vide):
    existant = User(username="alice", password_hash=None, oidc_subject="sub-123", role=ROLE_MEMBRE)
    db_vide.add(existant)
    db_vide.commit()
    db_vide.refresh(existant)

    resultat = oidc_service.resoudre_ou_provisionner_utilisateur(db_vide, {"sub": "sub-123", "preferred_username": "alice"})

    assert resultat.id == existant.id
    assert db_vide.query(User).count() == 1


def test_lie_un_compte_local_existant_non_encore_lie(db_vide):
    compte_local = User(username="alice", password_hash="pbkdf2_sha256$1$sel$hash", role=ROLE_PROPRIETAIRE)
    db_vide.add(compte_local)
    db_vide.commit()
    db_vide.refresh(compte_local)

    resultat = oidc_service.resoudre_ou_provisionner_utilisateur(db_vide, {"sub": "sub-nouveau", "preferred_username": "alice"})

    assert resultat.id == compte_local.id
    assert resultat.oidc_subject == "sub-nouveau"
    # Le mot de passe existant reste utilisable : Authentik s'AJOUTE, ne remplace rien.
    assert resultat.password_hash == "pbkdf2_sha256$1$sel$hash"
    assert resultat.role == ROLE_PROPRIETAIRE
    assert db_vide.query(User).count() == 1


def test_premier_login_oidc_sur_base_vide_devient_proprietaire(db_vide):
    assert db_vide.query(User).count() == 0

    resultat = oidc_service.resoudre_ou_provisionner_utilisateur(db_vide, {"sub": "sub-1", "preferred_username": "alice"})

    assert resultat.role == ROLE_PROPRIETAIRE
    assert resultat.oidc_subject == "sub-1"
    assert resultat.password_hash is None


def test_login_oidc_suivant_devient_membre(db_vide):
    db_vide.add(User(username="proprietaire", password_hash="x", role=ROLE_PROPRIETAIRE))
    db_vide.commit()

    resultat = oidc_service.resoudre_ou_provisionner_utilisateur(db_vide, {"sub": "sub-2", "preferred_username": "bob"})

    assert resultat.role == ROLE_MEMBRE
    assert resultat.username == "bob"


def test_provisioning_deduplique_le_nom_utilisateur_en_collision(db_vide):
    # "bob" existe déjà, mais lié à une AUTRE identité Authentik (donc pas de lien
    # possible) : le nouveau compte doit prendre un nom distinct plutôt qu'échouer
    # sur la contrainte d'unicité, ou pire, se lier au mauvais compte.
    db_vide.add(User(username="bob", password_hash=None, oidc_subject="sub-autre-personne", role=ROLE_MEMBRE))
    db_vide.commit()

    resultat = oidc_service.resoudre_ou_provisionner_utilisateur(db_vide, {"sub": "sub-3", "preferred_username": "bob"})

    assert resultat.username != "bob"
    assert resultat.username.startswith("bob-")
    assert resultat.oidc_subject == "sub-3"


def test_provisioning_repli_sur_email_si_pas_de_preferred_username(db_vide):
    resultat = oidc_service.resoudre_ou_provisionner_utilisateur(db_vide, {"sub": "sub-4", "email": "carole@example.com"})

    assert resultat.username == "carole"
