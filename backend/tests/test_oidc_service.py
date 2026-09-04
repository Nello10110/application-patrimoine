"""Verrouille `services/oidc_service.py` (connexion SSO Authentik) : configuration
lue depuis les variables d'environnement (jamais de base de données), signature/
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

ISSUER = "https://authentik.example.com/application/o/patrimoine"
CLIENT_ID = "client-abc"
CLIENT_SECRET = "secret-xyz"
REDIRECT_URI = "https://patrimoine.example.com/api/auth/oidc/callback"
FRONTEND_URL = "https://patrimoine.example.com"


@pytest.fixture(autouse=True)
def isoler_cache_decouverte():
    """Le cache de découverte OIDC est module-level (par design, cf. docstring de
    `oidc_service._discovery`) — le réinitialiser entre chaque test pour qu'aucun
    test n'hérite d'une réponse mise en cache par un test précédent."""
    oidc_service._discovery_cache.clear()
    yield
    oidc_service._discovery_cache.clear()


@pytest.fixture
def config_oidc(monkeypatch) -> "oidc_service.OidcConfig":
    monkeypatch.setenv(oidc_service.VARIABLE_ENABLED, "true")
    monkeypatch.setenv(oidc_service.VARIABLE_ISSUER, ISSUER)
    monkeypatch.setenv(oidc_service.VARIABLE_CLIENT_ID, CLIENT_ID)
    monkeypatch.setenv(oidc_service.VARIABLE_CLIENT_SECRET, CLIENT_SECRET)
    monkeypatch.setenv(oidc_service.VARIABLE_REDIRECT_URI, REDIRECT_URI)
    monkeypatch.setenv(oidc_service.VARIABLE_FRONTEND_URL, FRONTEND_URL)
    return oidc_service.charger_config()


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


# --- Configuration par variables d'environnement -----------------------------------


def test_charger_config_none_si_desactivee(monkeypatch):
    monkeypatch.setenv(oidc_service.VARIABLE_ENABLED, "false")
    monkeypatch.setenv(oidc_service.VARIABLE_ISSUER, ISSUER)
    monkeypatch.setenv(oidc_service.VARIABLE_CLIENT_ID, CLIENT_ID)
    monkeypatch.setenv(oidc_service.VARIABLE_CLIENT_SECRET, CLIENT_SECRET)
    monkeypatch.setenv(oidc_service.VARIABLE_REDIRECT_URI, REDIRECT_URI)
    monkeypatch.setenv(oidc_service.VARIABLE_FRONTEND_URL, FRONTEND_URL)

    assert oidc_service.charger_config() is None
    assert oidc_service.enabled() is False


def test_charger_config_none_si_non_activee_du_tout(monkeypatch):
    # Aucune variable posée (déploiement par défaut) : jamais d'exception, juste
    # désactivé — chemin critique de `GET /oidc/status`, public.
    for var in (oidc_service.VARIABLE_ENABLED, *oidc_service.VARIABLES_OBLIGATOIRES):
        monkeypatch.delenv(var, raising=False)

    assert oidc_service.charger_config() is None
    assert oidc_service.enabled() is False


def test_charger_config_none_si_une_variable_obligatoire_manque(config_oidc, monkeypatch):
    monkeypatch.delenv(oidc_service.VARIABLE_FRONTEND_URL, raising=False)

    assert oidc_service.charger_config() is None


def test_charger_config_valeurs_par_defaut_si_facultatives_absentes(config_oidc):
    assert config_oidc.display_name == oidc_service.DISPLAY_NAME_PAR_DEFAUT
    assert config_oidc.claim_username == oidc_service.CLAIM_USERNAME_PAR_DEFAUT
    assert config_oidc.claim_email == oidc_service.CLAIM_EMAIL_PAR_DEFAUT
    assert config_oidc.claim_nom == oidc_service.CLAIM_NOM_PAR_DEFAUT


def test_charger_config_personnalise_display_name_et_claims(config_oidc, monkeypatch):
    monkeypatch.setenv(oidc_service.VARIABLE_DISPLAY_NAME, "Authentik")
    monkeypatch.setenv(oidc_service.VARIABLE_CLAIM_USERNAME, "upn")
    monkeypatch.setenv(oidc_service.VARIABLE_CLAIM_EMAIL, "mail")
    monkeypatch.setenv(oidc_service.VARIABLE_CLAIM_NOM, "display_name")

    config = oidc_service.charger_config()
    assert config.display_name == "Authentik"
    assert config.claim_username == "upn"
    assert config.claim_email == "mail"
    assert config.claim_nom == "display_name"


# --- PKCE ----------------------------------------------------------------------


def test_code_verifier_et_challenge_sont_coherents():
    import base64
    import hashlib

    verifier, challenge = oidc_service.code_verifier_et_challenge()

    attendu = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode("ascii")).digest()).rstrip(b"=").decode("ascii")
    assert challenge == attendu
    assert "=" not in challenge  # PKCE S256 : jamais de padding dans le challenge


# --- State anti-CSRF (signé avec le `client_secret` OIDC) -------------------------


def test_state_valide_fait_laller_retour():
    verifier, _ = oidc_service.code_verifier_et_challenge()
    state = oidc_service.construire_state(verifier, CLIENT_SECRET)

    assert oidc_service.verifier_state(state, CLIENT_SECRET) == verifier


def test_state_altere_est_rejete():
    verifier, _ = oidc_service.code_verifier_et_challenge()
    state = oidc_service.construire_state(verifier, CLIENT_SECRET)
    altere = state[:-1] + ("0" if state[-1] != "0" else "1")

    with pytest.raises(oidc_service.OidcError):
        oidc_service.verifier_state(altere, CLIENT_SECRET)


def test_state_signe_avec_un_autre_secret_est_rejete():
    verifier, _ = oidc_service.code_verifier_et_challenge()
    state = oidc_service.construire_state(verifier, CLIENT_SECRET)

    with pytest.raises(oidc_service.OidcError):
        oidc_service.verifier_state(state, "un-autre-secret")


def test_state_malforme_est_rejete():
    with pytest.raises(oidc_service.OidcError):
        oidc_service.verifier_state("nimportequoi", CLIENT_SECRET)


def test_state_expire_est_rejete(monkeypatch):
    verifier, _ = oidc_service.code_verifier_et_challenge()
    state = oidc_service.construire_state(verifier, CLIENT_SECRET)

    plus_tard = time.time() + oidc_service.STATE_TTL_SECONDES + 60
    monkeypatch.setattr(oidc_service.time, "time", lambda: plus_tard)

    with pytest.raises(oidc_service.OidcError):
        oidc_service.verifier_state(state, CLIENT_SECRET)


# --- Découverte OIDC (mise en cache) ----------------------------------------------


def test_decouverte_mise_en_cache(monkeypatch):
    appels = []

    def faux_get(url, timeout=None):
        appels.append(url)
        return FausseReponse(200, DECOUVERTE)

    monkeypatch.setattr(oidc_service.requests, "get", faux_get)

    oidc_service._discovery(ISSUER)
    oidc_service._discovery(ISSUER)

    assert len(appels) == 1
    assert appels[0] == "https://authentik.example.com/application/o/patrimoine/.well-known/openid-configuration"


def test_decouverte_invalidee_apres_changement_dissuer(config_oidc, monkeypatch):
    appels = []

    def faux_get(url, timeout=None):
        appels.append(url)
        return FausseReponse(200, DECOUVERTE)

    monkeypatch.setattr(oidc_service.requests, "get", faux_get)
    oidc_service._discovery(ISSUER)
    assert len(appels) == 1

    monkeypatch.setenv(oidc_service.VARIABLE_ISSUER, "https://autre-authentik.example.com/application/o/patrimoine")
    nouvelle_config = oidc_service.charger_config()
    oidc_service._discovery(nouvelle_config.issuer)

    assert len(appels) == 2  # pas de réutilisation d'un cache périmé pour un autre issuer


def test_url_autorisation_contient_les_bons_parametres(config_oidc, monkeypatch):
    monkeypatch.setattr(oidc_service.requests, "get", lambda url, timeout=None: FausseReponse(200, DECOUVERTE))

    url = oidc_service.url_autorisation(config_oidc, "mon-state", "mon-challenge")

    base = urlparse(url)
    params = parse_qs(base.query)
    assert base.scheme + "://" + base.netloc + base.path == DECOUVERTE["authorization_endpoint"]
    assert params["response_type"] == ["code"]
    assert params["client_id"] == [CLIENT_ID]
    assert params["redirect_uri"] == [REDIRECT_URI]
    assert params["state"] == ["mon-state"]
    assert params["code_challenge"] == ["mon-challenge"]
    assert params["code_challenge_method"] == ["S256"]


# --- Échange de code / récupération d'identité --------------------------------------


def test_echanger_code_succes(config_oidc, monkeypatch):
    monkeypatch.setattr(oidc_service.requests, "get", lambda url, timeout=None: FausseReponse(200, DECOUVERTE))
    monkeypatch.setattr(oidc_service.requests, "post", lambda url, data=None, timeout=None: FausseReponse(200, {"access_token": "at-123"}))

    resultat = oidc_service.echanger_code(config_oidc, "un-code", "un-verifier")

    assert resultat["access_token"] == "at-123"


def test_echanger_code_statut_non_200_leve(config_oidc, monkeypatch):
    monkeypatch.setattr(oidc_service.requests, "get", lambda url, timeout=None: FausseReponse(200, DECOUVERTE))
    monkeypatch.setattr(oidc_service.requests, "post", lambda url, data=None, timeout=None: FausseReponse(400, {"error": "invalid_grant"}))

    with pytest.raises(oidc_service.OidcError):
        oidc_service.echanger_code(config_oidc, "un-code", "un-verifier")


def test_echanger_code_sans_access_token_leve(config_oidc, monkeypatch):
    monkeypatch.setattr(oidc_service.requests, "get", lambda url, timeout=None: FausseReponse(200, DECOUVERTE))
    monkeypatch.setattr(oidc_service.requests, "post", lambda url, data=None, timeout=None: FausseReponse(200, {}))

    with pytest.raises(oidc_service.OidcError):
        oidc_service.echanger_code(config_oidc, "un-code", "un-verifier")


def test_recuperer_identite_succes(config_oidc, monkeypatch):
    appels = {}

    def faux_get(url, headers=None, timeout=None):
        if "userinfo" in url:
            appels["headers"] = headers
            return FausseReponse(200, {"sub": "sub-123", "preferred_username": "alice", "email": "alice@example.com"})
        return FausseReponse(200, DECOUVERTE)

    monkeypatch.setattr(oidc_service.requests, "get", faux_get)

    claims = oidc_service.recuperer_identite(config_oidc, "at-123")

    assert claims["sub"] == "sub-123"
    assert appels["headers"]["Authorization"] == "Bearer at-123"


def test_recuperer_identite_statut_non_200_leve(config_oidc, monkeypatch):
    def faux_get(url, headers=None, timeout=None):
        if "userinfo" in url:
            return FausseReponse(403, {})
        return FausseReponse(200, DECOUVERTE)

    monkeypatch.setattr(oidc_service.requests, "get", faux_get)

    with pytest.raises(oidc_service.OidcError):
        oidc_service.recuperer_identite(config_oidc, "at-123")


def test_recuperer_identite_sans_sub_leve(config_oidc, monkeypatch):
    def faux_get(url, headers=None, timeout=None):
        if "userinfo" in url:
            return FausseReponse(200, {"preferred_username": "alice"})
        return FausseReponse(200, DECOUVERTE)

    monkeypatch.setattr(oidc_service.requests, "get", faux_get)

    with pytest.raises(oidc_service.OidcError):
        oidc_service.recuperer_identite(config_oidc, "at-123")


# --- Nom d'utilisateur dérivé des claims (mapping configurable) --------------------


def test_nom_utilisateur_utilise_le_claim_configure():
    resultat = oidc_service._nom_utilisateur_depuis_claims({"upn": "alice.upn", "preferred_username": "alice.pu"}, "upn")

    assert resultat == "alice.upn"


def test_nom_utilisateur_repli_sur_email_si_claim_configure_absent():
    resultat = oidc_service._nom_utilisateur_depuis_claims({"email": "carole@example.com"}, "preferred_username")

    assert resultat == "carole"


# --- Résolution / provisioning de compte ------------------------------------------


def config_defaut(**overrides) -> "oidc_service.OidcConfig":
    """`OidcConfig` minimal pour les tests de résolution/provisioning — ces tests
    n'appellent jamais le réseau (`echanger_code`/`recuperer_identite`), seules
    `claim_username`/`claim_email`/`claim_nom` (mapping) importent réellement ici."""
    valeurs = dict(
        issuer=ISSUER,
        client_id=CLIENT_ID,
        client_secret=CLIENT_SECRET,
        redirect_uri=REDIRECT_URI,
        frontend_url=FRONTEND_URL,
        display_name=oidc_service.DISPLAY_NAME_PAR_DEFAUT,
        claim_username=oidc_service.CLAIM_USERNAME_PAR_DEFAUT,
        claim_email=oidc_service.CLAIM_EMAIL_PAR_DEFAUT,
        claim_nom=oidc_service.CLAIM_NOM_PAR_DEFAUT,
    )
    valeurs.update(overrides)
    return oidc_service.OidcConfig(**valeurs)


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

    resultat = oidc_service.resoudre_ou_provisionner_utilisateur(db_vide, config_defaut(), {"sub": "sub-123", "preferred_username": "alice"})

    assert resultat.id == existant.id
    assert db_vide.query(User).count() == 1


def test_lie_un_compte_local_existant_non_encore_lie(db_vide):
    compte_local = User(username="alice", password_hash="pbkdf2_sha256$1$sel$hash", role=ROLE_PROPRIETAIRE)
    db_vide.add(compte_local)
    db_vide.commit()
    db_vide.refresh(compte_local)

    resultat = oidc_service.resoudre_ou_provisionner_utilisateur(db_vide, config_defaut(), {"sub": "sub-nouveau", "preferred_username": "alice"})

    assert resultat.id == compte_local.id
    assert resultat.oidc_subject == "sub-nouveau"
    # Le mot de passe existant reste utilisable : le SSO s'AJOUTE, ne remplace rien.
    assert resultat.password_hash == "pbkdf2_sha256$1$sel$hash"
    assert resultat.role == ROLE_PROPRIETAIRE
    assert db_vide.query(User).count() == 1


def test_premier_login_oidc_sur_base_vide_devient_proprietaire(db_vide):
    assert db_vide.query(User).count() == 0

    resultat = oidc_service.resoudre_ou_provisionner_utilisateur(db_vide, config_defaut(), {"sub": "sub-1", "preferred_username": "alice"})

    assert resultat.role == ROLE_PROPRIETAIRE
    assert resultat.oidc_subject == "sub-1"
    assert resultat.password_hash is None
    assert resultat.owner_user_id is None


def test_login_oidc_suivant_devient_membre_rattache_au_foyer_du_proprietaire(db_vide):
    proprietaire = User(username="proprietaire", password_hash="x", role=ROLE_PROPRIETAIRE)
    db_vide.add(proprietaire)
    db_vide.commit()
    db_vide.refresh(proprietaire)

    resultat = oidc_service.resoudre_ou_provisionner_utilisateur(db_vide, config_defaut(), {"sub": "sub-2", "preferred_username": "bob"})

    assert resultat.role == ROLE_MEMBRE
    assert resultat.username == "bob"
    # Bug trouvé en vérification bout en bout : sans `owner_user_id`, ce compte
    # devenait son propre foyer vide plutôt que de rejoindre le patrimoine partagé.
    assert resultat.owner_user_id == proprietaire.id


def test_provisioning_deduplique_le_nom_utilisateur_en_collision(db_vide):
    # "bob" existe déjà, mais lié à une AUTRE identité SSO (donc pas de lien
    # possible) : le nouveau compte doit prendre un nom distinct plutôt qu'échouer
    # sur la contrainte d'unicité, ou pire, se lier au mauvais compte.
    db_vide.add(User(username="bob", password_hash=None, oidc_subject="sub-autre-personne", role=ROLE_MEMBRE))
    db_vide.commit()

    resultat = oidc_service.resoudre_ou_provisionner_utilisateur(db_vide, config_defaut(), {"sub": "sub-3", "preferred_username": "bob"})

    assert resultat.username != "bob"
    assert resultat.username.startswith("bob-")
    assert resultat.oidc_subject == "sub-3"


def test_provisioning_repli_sur_email_si_pas_de_preferred_username(db_vide):
    resultat = oidc_service.resoudre_ou_provisionner_utilisateur(db_vide, config_defaut(), {"sub": "sub-4", "email": "carole@example.com"})

    assert resultat.username == "carole"


# --- Claim mapping : email/nom (backlog SSO) ----------------------------------------


def test_provisioning_peuple_email_et_nom_depuis_les_claims_mappes(db_vide):
    resultat = oidc_service.resoudre_ou_provisionner_utilisateur(
        db_vide, config_defaut(), {"sub": "sub-5", "preferred_username": "dave", "email": "dave@example.com", "name": "Dave Dupont"}
    )

    assert resultat.email == "dave@example.com"
    assert resultat.nom == "Dave Dupont"


def test_provisioning_avec_claim_mapping_personnalise(db_vide):
    config = config_defaut(claim_username="upn", claim_email="mail", claim_nom="display_name")

    resultat = oidc_service.resoudre_ou_provisionner_utilisateur(
        db_vide, config, {"sub": "sub-6", "upn": "eve", "mail": "eve@example.com", "display_name": "Eve Martin"}
    )

    assert resultat.username == "eve"
    assert resultat.email == "eve@example.com"
    assert resultat.nom == "Eve Martin"


def test_reconnexion_resynchronise_email_et_nom_mais_jamais_username(db_vide):
    config = config_defaut()
    premier = oidc_service.resoudre_ou_provisionner_utilisateur(
        db_vide, config, {"sub": "sub-7", "preferred_username": "frank", "email": "frank@example.com", "name": "Frank"}
    )
    assert premier.username == "frank"

    # Reconnexion avec un `preferred_username` ET un nom/email différents côté IdP.
    second = oidc_service.resoudre_ou_provisionner_utilisateur(
        db_vide, config, {"sub": "sub-7", "preferred_username": "frank.nouveau", "email": "frank.nouveau@example.com", "name": "Frank N."}
    )

    assert second.id == premier.id
    assert second.username == "frank"  # jamais réécrit après la création
    assert second.email == "frank.nouveau@example.com"  # resynchronisé
    assert second.nom == "Frank N."  # resynchronisé
    assert db_vide.query(User).count() == 1


def test_reconnexion_claim_absent_ne_supprime_pas_une_valeur_deja_connue(db_vide):
    config = config_defaut()
    oidc_service.resoudre_ou_provisionner_utilisateur(
        db_vide, config, {"sub": "sub-8", "preferred_username": "gabi", "email": "gabi@example.com", "name": "Gabi"}
    )

    # Reconnexion sans les claims email/name (scope momentanément refusé, IdP mal
    # configuré...) : ne doit pas effacer ce qui est déjà connu.
    resultat = oidc_service.resoudre_ou_provisionner_utilisateur(db_vide, config, {"sub": "sub-8", "preferred_username": "gabi"})

    assert resultat.email == "gabi@example.com"
    assert resultat.nom == "Gabi"
