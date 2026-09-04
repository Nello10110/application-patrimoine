"""Connexion SSO via un fournisseur OIDC (backlog SSO) — pas lié à une stack
particulière : le fournisseur (Authentik, Keycloak, Zitadel, Okta...) est entièrement
configuré par variables d'environnement, jamais codé en dur dans ce module.
L'utilisateur de ce déploiement utilise Authentik en pratique (mentionné ici et dans
la documentation à titre d'exemple concret), mais rien dans ce code ne le suppose.

Point de sécurité central de ce module, à ne jamais perdre de vue : il ne fait
JAMAIS confiance à un en-tête envoyé par un proxy (`X-authentik-*`/`X-forwarded-*`
ou équivalent). Un proxy provider protège déjà l'application en amont pour certains
déploiements — mais cette protection peut être retirée un jour, et ce module doit
rester tout aussi sûr ce jour-là. Toute la confiance vient d'un échange direct,
serveur à serveur, authentifié par le `client_secret` (jamais transmis au
navigateur) : l'échange du code d'autorisation contre un jeton d'accès, puis l'appel
`userinfo` avec ce jeton. Retirer un éventuel proxy en amont n'a donc aucun effet sur
la sécurité de ce flux.

Configuration entièrement portée par des variables d'environnement (`PATRIMOINE_OIDC_*`,
posées dans le `.env`/`compose` de l'exploitant — cf. docs/MANUEL_EXPLOITATION.md
§12.1) — pas par une interface d'administration en base : un `client_secret` qui ne
vit jamais qu'en variable d'environnement n'a pas besoin d'être chiffré au repos,
contrairement à un secret stocké en base de données. Toute modification exige un
redémarrage du backend (les variables d'environnement ne sont lues qu'à l'appel, mais
un process Docker ne les recharge qu'au redémarrage).

Pas de nouvelle dépendance (`requests` est déjà présente) : PKCE et la signature du
`state` anti-CSRF utilisent `hashlib`/`hmac`/`secrets`/`base64` de la bibliothèque
standard, cohérent avec la philosophie déjà appliquée dans ce projet. La clé HMAC qui
signe le `state` est dérivée du `client_secret` OIDC lui-même (déjà un secret fort,
jamais transmis au navigateur, disponible partout où `OidcConfig` l'est) — pas besoin
d'une variable d'environnement dédiée à cette seule fin.
"""

import base64
import hashlib
import hmac
import os
import secrets
import time
from dataclasses import dataclass
from urllib.parse import urlencode

import requests
from sqlalchemy.orm import Session

from ..models import ROLE_MEMBRE, ROLE_PROPRIETAIRE, User
from . import auth_service

VARIABLE_ENABLED = "PATRIMOINE_OIDC_ENABLED"
VARIABLE_ISSUER = "PATRIMOINE_OIDC_ISSUER"
VARIABLE_CLIENT_ID = "PATRIMOINE_OIDC_CLIENT_ID"
VARIABLE_CLIENT_SECRET = "PATRIMOINE_OIDC_CLIENT_SECRET"
VARIABLE_REDIRECT_URI = "PATRIMOINE_OIDC_REDIRECT_URI"
VARIABLE_FRONTEND_URL = "PATRIMOINE_OIDC_FRONTEND_URL"
VARIABLE_DISPLAY_NAME = "PATRIMOINE_OIDC_DISPLAY_NAME"
VARIABLE_CLAIM_USERNAME = "PATRIMOINE_OIDC_CLAIM_USERNAME"
VARIABLE_CLAIM_EMAIL = "PATRIMOINE_OIDC_CLAIM_EMAIL"
VARIABLE_CLAIM_NOM = "PATRIMOINE_OIDC_CLAIM_NOM"
# Obligatoires si `VARIABLE_ENABLED` vaut vrai — une seule manquante désactive tout
# le flux (cf. `charger_config`), sans exception.
VARIABLES_OBLIGATOIRES = (
    VARIABLE_ISSUER,
    VARIABLE_CLIENT_ID,
    VARIABLE_CLIENT_SECRET,
    VARIABLE_REDIRECT_URI,
    VARIABLE_FRONTEND_URL,
)

STATE_TTL_SECONDES = 300  # 5 minutes : largement suffisant pour l'aller-retour vers le fournisseur SSO
SCOPES = "openid profile email"

DISPLAY_NAME_PAR_DEFAUT = "SSO"
# Claims standard des scopes OIDC `profile`/`email` (déjà demandés ci-dessus) — repris
# tels quels par la plupart des fournisseurs, personnalisables par variable
# d'environnement si le fournisseur utilisé s'en écarte.
CLAIM_USERNAME_PAR_DEFAUT = "preferred_username"
CLAIM_EMAIL_PAR_DEFAUT = "email"
CLAIM_NOM_PAR_DEFAUT = "name"

_discovery_cache: dict[str, dict] = {}


class OidcError(Exception):
    """Toute erreur du flux OIDC destinée à être affichée à l'utilisateur (message
    déjà en français, sûr à renvoyer tel quel dans `?oidc_error=`)."""


@dataclass
class OidcConfig:
    issuer: str
    client_id: str
    client_secret: str  # jamais journalisé ni renvoyé par l'API
    redirect_uri: str
    frontend_url: str
    display_name: str
    claim_username: str
    claim_email: str
    claim_nom: str


def _active() -> bool:
    return os.environ.get(VARIABLE_ENABLED, "").strip().lower() in ("1", "true")


def charger_config() -> OidcConfig | None:
    """`None` si `PATRIMOINE_OIDC_ENABLED` n'est pas activée, ou si l'une des 5
    variables obligatoires est absente — jamais d'exception propagée : cette
    fonction est appelée par `GET /oidc/status`, public et sur le chemin critique de
    la page de connexion."""
    if not _active():
        return None
    valeurs = {var: os.environ.get(var) for var in VARIABLES_OBLIGATOIRES}
    if any(not v for v in valeurs.values()):
        return None
    return OidcConfig(
        issuer=valeurs[VARIABLE_ISSUER],
        client_id=valeurs[VARIABLE_CLIENT_ID],
        client_secret=valeurs[VARIABLE_CLIENT_SECRET],
        redirect_uri=valeurs[VARIABLE_REDIRECT_URI],
        frontend_url=valeurs[VARIABLE_FRONTEND_URL],
        display_name=os.environ.get(VARIABLE_DISPLAY_NAME, "").strip() or DISPLAY_NAME_PAR_DEFAUT,
        claim_username=os.environ.get(VARIABLE_CLAIM_USERNAME, "").strip() or CLAIM_USERNAME_PAR_DEFAUT,
        claim_email=os.environ.get(VARIABLE_CLAIM_EMAIL, "").strip() or CLAIM_EMAIL_PAR_DEFAUT,
        claim_nom=os.environ.get(VARIABLE_CLAIM_NOM, "").strip() or CLAIM_NOM_PAR_DEFAUT,
    )


def enabled() -> bool:
    return charger_config() is not None


def _issuer_normalise(issuer: str) -> str:
    return issuer if issuer.endswith("/") else issuer + "/"


def _discovery(issuer: str) -> dict:
    """Découverte OIDC standard (`.well-known/openid-configuration`) plutôt que des
    URLs codées en dur pour un fournisseur particulier : robuste aux versions et aux
    schémas d'URL différents d'un fournisseur à l'autre. Mise en cache en mémoire
    process, clé = issuer."""
    issuer = _issuer_normalise(issuer)
    if issuer not in _discovery_cache:
        reponse = requests.get(f"{issuer}.well-known/openid-configuration", timeout=10)
        reponse.raise_for_status()
        _discovery_cache[issuer] = reponse.json()
    return _discovery_cache[issuer]


def code_verifier_et_challenge() -> tuple[str, str]:
    """PKCE S256 (RFC 7636)."""
    verifier = secrets.token_urlsafe(48)
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    challenge = base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")
    return verifier, challenge


def construire_state(code_verifier: str, client_secret: str) -> str:
    """`state` auto-porteur et signé — aucune table ni session serveur nécessaire
    pour le vérifier au retour du fournisseur SSO (fonctionne même avec plusieurs
    workers). Signé avec `client_secret` (préoccupation propre à cette application,
    pas au fournisseur SSO) plutôt qu'une variable d'environnement dédiée. Format :
    `nonce.horodatage.code_verifier.signature`, chaque partie en base64url."""
    nonce = secrets.token_urlsafe(16)
    horodatage = str(int(time.time()))
    charge = f"{nonce}.{horodatage}.{code_verifier}"
    signature = hmac.new(client_secret.encode("utf-8"), charge.encode("utf-8"), hashlib.sha256).hexdigest()
    return f"{charge}.{signature}"


def verifier_state(state_recu: str, client_secret: str) -> str:
    """Vérifie la signature (comparaison à temps constant) et la fraîcheur du
    `state` reçu. Renvoie le `code_verifier` PKCE encodé dedans, à réutiliser pour
    l'échange de code. Lève `OidcError` sinon (jamais de détail technique exposé)."""
    parties = state_recu.split(".")
    if len(parties) != 4:
        raise OidcError("Connexion SSO invalide (state malformé). Réessayez.")
    nonce, horodatage, code_verifier, signature_recue = parties
    charge = f"{nonce}.{horodatage}.{code_verifier}"
    signature_attendue = hmac.new(client_secret.encode("utf-8"), charge.encode("utf-8"), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(signature_recue, signature_attendue):
        raise OidcError("Connexion SSO invalide (state altéré). Réessayez.")
    if time.time() - int(horodatage) > STATE_TTL_SECONDES:
        raise OidcError("La connexion SSO a expiré. Réessayez.")
    return code_verifier


def url_autorisation(config: OidcConfig, state: str, code_challenge: str) -> str:
    parametres = {
        "response_type": "code",
        "client_id": config.client_id,
        "redirect_uri": config.redirect_uri,
        "scope": SCOPES,
        "state": state,
        "code_challenge": code_challenge,
        "code_challenge_method": "S256",
    }
    return f"{_discovery(config.issuer)['authorization_endpoint']}?{urlencode(parametres)}"


def echanger_code(config: OidcConfig, code: str, code_verifier: str) -> dict:
    """Échange le code d'autorisation contre un jeton d'accès — appel serveur à
    serveur authentifié par `client_secret`, jamais exposé au navigateur."""
    reponse = requests.post(
        _discovery(config.issuer)["token_endpoint"],
        data={
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": config.redirect_uri,
            "client_id": config.client_id,
            "client_secret": config.client_secret,
            "code_verifier": code_verifier,
        },
        timeout=10,
    )
    if reponse.status_code != 200:
        raise OidcError("Le fournisseur SSO a refusé l'échange du code de connexion. Réessayez.")
    corps = reponse.json()
    if "access_token" not in corps:
        raise OidcError("Réponse du fournisseur SSO inattendue (jeton d'accès manquant). Réessayez.")
    return corps


def recuperer_identite(config: OidcConfig, access_token: str) -> dict:
    """Claims vérifiées via l'endpoint `userinfo` (authentifié par le jeton d'accès
    obtenu ci-dessus) — jamais via un `id_token` décodé sans vérification de
    signature : c'est cet appel authentifié qui fait foi sur l'identité."""
    reponse = requests.get(
        _discovery(config.issuer)["userinfo_endpoint"],
        headers={"Authorization": f"Bearer {access_token}"},
        timeout=10,
    )
    if reponse.status_code != 200:
        raise OidcError("Impossible de récupérer l'identité depuis le fournisseur SSO. Réessayez.")
    claims = reponse.json()
    if not claims.get("sub"):
        raise OidcError("Réponse du fournisseur SSO inattendue (identifiant manquant). Réessayez.")
    return claims


def _nom_utilisateur_depuis_claims(claims: dict, claim_username: str) -> str:
    brut = claims.get(claim_username) or (claims.get("email") or "").split("@")[0] or "utilisateur"
    nettoye = "".join(c for c in brut.strip() if c.isalnum() or c in "-_.")
    return (nettoye or "utilisateur")[:32] or "utilisateur"


def resoudre_ou_provisionner_utilisateur(db: Session, config: OidcConfig, claims: dict) -> User:
    """1. `oidc_subject` déjà lié → ce compte, `email`/`nom` resynchronisés depuis les
       claims mappés (`config.claim_email`/`config.claim_nom`) à CHAQUE connexion —
       mais jamais `username`, qui reste l'identifiant de connexion figé après sa
       création (cf. docstring de `User` : le réécrire silencieusement risquerait une
       collision avec un autre compte ou une confusion dans "Comptes du foyer").
    2. Sinon, un compte local du même `username` existe et n'a encore aucun
       `oidc_subject` → on le lie (le SSO devient un second moyen de connexion à un
       compte déjà créé à la main), rôle et mot de passe inchangés ; `email`/`nom`
       peuplés au moment de ce premier lien.
    3. Sinon, auto-provisionne (backlog SSO, décision utilisateur) : `proprietaire`
       seulement si aucun compte n'existe encore (bootstrap, même logique que
       `POST /api/auth/register`), sinon `membre` **rattaché au foyer du propriétaire
       déjà en place** (`owner_user_id`, même logique que `POST /household-members`)
       — sans ça, le compte devenait son propre foyer vide, sans accès au patrimoine
       partagé (bug trouvé en vérification bout en bout, avant toute mise en
       production). Jamais un rôle plus privilégié auto-attribué à un compte non créé
       à la main. `username` dérivé du claim configuré (`config.claim_username`,
       une seule fois) ; `email`/`nom` peuplés dès la création."""
    sub = claims["sub"]
    email = claims.get(config.claim_email)
    nom = claims.get(config.claim_nom)

    existant = auth_service.utilisateur_par_oidc_subject(db, sub)
    if existant is not None:
        auth_service.mettre_a_jour_profil_oidc(db, existant, email=email, nom=nom)
        return existant

    username_souhaite = _nom_utilisateur_depuis_claims(claims, config.claim_username)
    par_username = auth_service.utilisateur_par_username(db, username_souhaite)
    if par_username is not None and par_username.oidc_subject is None:
        auth_service.lier_oidc(db, par_username, sub)
        auth_service.mettre_a_jour_profil_oidc(db, par_username, email=email, nom=nom)
        return par_username

    proprietaire = db.query(User).filter(User.role == ROLE_PROPRIETAIRE).first()
    role = ROLE_PROPRIETAIRE if proprietaire is None else ROLE_MEMBRE
    owner_user_id = proprietaire.id if proprietaire is not None else None
    username_final = username_souhaite
    suffixe = 2
    while auth_service.utilisateur_par_username(db, username_final) is not None:
        username_final = f"{username_souhaite[:29]}-{suffixe}"
        suffixe += 1
    return auth_service.creer_utilisateur_oidc(
        db, username_final, sub, role=role, owner_user_id=owner_user_id, email=email, nom=nom
    )
