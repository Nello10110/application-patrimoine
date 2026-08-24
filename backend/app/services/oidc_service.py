"""Connexion SSO via Authentik (OIDC applicatif, backlog SSO Authentik).

Point de sécurité central de ce module, à ne jamais perdre de vue : il ne fait
JAMAIS confiance à un en-tête envoyé par un proxy (`X-authentik-*` ou équivalent).
L'utilisateur expose déjà l'application derrière un proxy provider Authentik
(forward-auth) pour une protection globale du homelab — mais cette protection peut
être retirée un jour, et ce module doit rester tout aussi sûr ce jour-là. Toute la
confiance vient d'un échange direct, serveur à serveur, authentifié par
`AUTHENTIK_CLIENT_SECRET` (jamais transmis au navigateur) : l'échange du code
d'autorisation contre un jeton d'accès, puis l'appel `userinfo` avec ce jeton.
Retirer le proxy provider n'a donc aucun effet sur la sécurité de ce flux.

Pas de nouvelle dépendance (`requests`/`cryptography` sont déjà présentes) : PKCE et
la signature du `state` anti-CSRF utilisent `hashlib`/`hmac`/`secrets`/`base64` de la
bibliothèque standard, cohérent avec la philosophie déjà appliquée dans ce projet.
"""

import base64
import hashlib
import hmac
import os
import secrets
import time

import requests
from sqlalchemy.orm import Session

from ..models import ROLE_MEMBRE, ROLE_PROPRIETAIRE, User
from . import auth_service

VAR_ISSUER = "AUTHENTIK_ISSUER"
VAR_CLIENT_ID = "AUTHENTIK_CLIENT_ID"
VAR_CLIENT_SECRET = "AUTHENTIK_CLIENT_SECRET"
VAR_REDIRECT_URI = "AUTHENTIK_REDIRECT_URI"
VAR_FRONTEND_URL = "AUTHENTIK_FRONTEND_URL"

STATE_TTL_SECONDES = 300  # 5 minutes : largement suffisant pour l'aller-retour Authentik
SCOPES = "openid profile email"

_discovery_cache: dict | None = None


class OidcError(Exception):
    """Toute erreur du flux OIDC destinée à être affichée à l'utilisateur (message
    déjà en français, sûr à renvoyer tel quel dans `?oidc_error=`)."""


def _variable(nom: str) -> str | None:
    valeur = os.environ.get(nom)
    return valeur.strip() if valeur else None


def enabled() -> bool:
    return all(_variable(v) for v in (VAR_ISSUER, VAR_CLIENT_ID, VAR_CLIENT_SECRET, VAR_REDIRECT_URI, VAR_FRONTEND_URL))


def frontend_url() -> str:
    return (_variable(VAR_FRONTEND_URL) or "").rstrip("/")


def _issuer() -> str:
    issuer = _variable(VAR_ISSUER) or ""
    return issuer if issuer.endswith("/") else issuer + "/"


def _discovery() -> dict:
    """Découverte OIDC standard (`.well-known/openid-configuration`) plutôt que des
    URLs Authentik codées en dur : robuste aux versions et aux schémas d'URL
    différents d'une instance à l'autre. Mise en cache en mémoire process — recalculée
    seulement au redémarrage, comme le reste de la configuration lue depuis
    l'environnement dans ce projet."""
    global _discovery_cache
    if _discovery_cache is None:
        reponse = requests.get(f"{_issuer()}.well-known/openid-configuration", timeout=10)
        reponse.raise_for_status()
        _discovery_cache = reponse.json()
    return _discovery_cache


def code_verifier_et_challenge() -> tuple[str, str]:
    """PKCE S256 (RFC 7636)."""
    verifier = secrets.token_urlsafe(48)
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    challenge = base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")
    return verifier, challenge


def construire_state(code_verifier: str) -> str:
    """`state` auto-porteur et signé — aucune table ni session serveur nécessaire
    pour le vérifier au retour d'Authentik (fonctionne même avec plusieurs workers).
    Format : `nonce.horodatage.code_verifier.signature`, chaque partie en base64url."""
    nonce = secrets.token_urlsafe(16)
    horodatage = str(int(time.time()))
    charge = f"{nonce}.{horodatage}.{code_verifier}"
    cle = (_variable(VAR_CLIENT_SECRET) or "").encode("utf-8")
    signature = hmac.new(cle, charge.encode("utf-8"), hashlib.sha256).hexdigest()
    return f"{charge}.{signature}"


def verifier_state(state_recu: str) -> str:
    """Vérifie la signature (comparaison à temps constant) et la fraîcheur du
    `state` reçu. Renvoie le `code_verifier` PKCE encodé dedans, à réutiliser pour
    l'échange de code. Lève `OidcError` sinon (jamais de détail technique exposé)."""
    parties = state_recu.split(".")
    if len(parties) != 4:
        raise OidcError("Connexion Authentik invalide (state malformé). Réessayez.")
    nonce, horodatage, code_verifier, signature_recue = parties
    charge = f"{nonce}.{horodatage}.{code_verifier}"
    cle = (_variable(VAR_CLIENT_SECRET) or "").encode("utf-8")
    signature_attendue = hmac.new(cle, charge.encode("utf-8"), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(signature_recue, signature_attendue):
        raise OidcError("Connexion Authentik invalide (state altéré). Réessayez.")
    if time.time() - int(horodatage) > STATE_TTL_SECONDES:
        raise OidcError("La connexion Authentik a expiré. Réessayez.")
    return code_verifier


def url_autorisation(state: str, code_challenge: str) -> str:
    from urllib.parse import urlencode

    parametres = {
        "response_type": "code",
        "client_id": _variable(VAR_CLIENT_ID),
        "redirect_uri": _variable(VAR_REDIRECT_URI),
        "scope": SCOPES,
        "state": state,
        "code_challenge": code_challenge,
        "code_challenge_method": "S256",
    }
    return f"{_discovery()['authorization_endpoint']}?{urlencode(parametres)}"


def echanger_code(code: str, code_verifier: str) -> dict:
    """Échange le code d'autorisation contre un jeton d'accès — appel serveur à
    serveur authentifié par `client_secret`, jamais exposé au navigateur."""
    reponse = requests.post(
        _discovery()["token_endpoint"],
        data={
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": _variable(VAR_REDIRECT_URI),
            "client_id": _variable(VAR_CLIENT_ID),
            "client_secret": _variable(VAR_CLIENT_SECRET),
            "code_verifier": code_verifier,
        },
        timeout=10,
    )
    if reponse.status_code != 200:
        raise OidcError("Authentik a refusé l'échange du code de connexion. Réessayez.")
    corps = reponse.json()
    if "access_token" not in corps:
        raise OidcError("Réponse Authentik inattendue (jeton d'accès manquant). Réessayez.")
    return corps


def recuperer_identite(access_token: str) -> dict:
    """Claims vérifiées via l'endpoint `userinfo` (authentifié par le jeton d'accès
    obtenu ci-dessus) — jamais via un `id_token` décodé sans vérification de
    signature : c'est cet appel authentifié qui fait foi sur l'identité."""
    reponse = requests.get(
        _discovery()["userinfo_endpoint"],
        headers={"Authorization": f"Bearer {access_token}"},
        timeout=10,
    )
    if reponse.status_code != 200:
        raise OidcError("Impossible de récupérer l'identité depuis Authentik. Réessayez.")
    claims = reponse.json()
    if not claims.get("sub"):
        raise OidcError("Réponse Authentik inattendue (identifiant manquant). Réessayez.")
    return claims


def _nom_utilisateur_depuis_claims(claims: dict) -> str:
    brut = claims.get("preferred_username") or (claims.get("email") or "").split("@")[0] or "utilisateur"
    nettoye = "".join(c for c in brut.strip() if c.isalnum() or c in "-_.")
    return (nettoye or "utilisateur")[:32] or "utilisateur"


def resoudre_ou_provisionner_utilisateur(db: Session, claims: dict) -> User:
    """1. `oidc_subject` déjà lié → ce compte, tel quel.
    2. Sinon, un compte local du même `username` existe et n'a encore aucun
       `oidc_subject` → on le lie (Authentik devient un second moyen de connexion
       à un compte déjà créé à la main), rôle et mot de passe inchangés.
    3. Sinon, auto-provisionne (backlog SSO Authentik, décision utilisateur) :
       `proprietaire` seulement si aucun compte n'existe encore (bootstrap, même
       logique que `POST /api/auth/register`), sinon `membre` — jamais un rôle plus
       privilégié auto-attribué à un compte non créé à la main."""
    sub = claims["sub"]
    existant = auth_service.utilisateur_par_oidc_subject(db, sub)
    if existant is not None:
        return existant

    username_souhaite = _nom_utilisateur_depuis_claims(claims)
    par_username = auth_service.utilisateur_par_username(db, username_souhaite)
    if par_username is not None and par_username.oidc_subject is None:
        auth_service.lier_oidc(db, par_username, sub)
        return par_username

    role = ROLE_PROPRIETAIRE if db.query(User).count() == 0 else ROLE_MEMBRE
    username_final = username_souhaite
    suffixe = 2
    while auth_service.utilisateur_par_username(db, username_final) is not None:
        username_final = f"{username_souhaite[:29]}-{suffixe}"
        suffixe += 1
    return auth_service.creer_utilisateur_oidc(db, username_final, sub, role=role)
