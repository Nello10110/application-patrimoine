"""Connexion SSO via Authentik (OIDC applicatif, backlog SSO Authentik).

Point de sécurité central de ce module, à ne jamais perdre de vue : il ne fait
JAMAIS confiance à un en-tête envoyé par un proxy (`X-authentik-*` ou équivalent).
L'utilisateur expose déjà l'application derrière un proxy provider Authentik
(forward-auth) pour une protection globale du homelab — mais cette protection peut
être retirée un jour, et ce module doit rester tout aussi sûr ce jour-là. Toute la
confiance vient d'un échange direct, serveur à serveur, authentifié par le
`client_secret` (jamais transmis au navigateur) : l'échange du code d'autorisation
contre un jeton d'accès, puis l'appel `userinfo` avec ce jeton. Retirer le proxy
provider n'a donc aucun effet sur la sécurité de ce flux.

Configuration administrable depuis Réglages (propriétaire), stockée dans la table
générique `Parametre` — sauf le `client_secret`, chiffré au repos (Fernet) avec une
clé qui, elle, reste en variable d'environnement (`PATRIMOINE_SECRET_KEY`) : jamais
le secret en clair dans le fichier SQLite (sauvegardes comprises). Même principe que
`services/backup_service.py` (`PATRIMOINE_BACKUP_KEY`), à qui ce module emprunte son
patron de chiffrement — clé volontairement distincte de celle des sauvegardes
(séparation des clés, la compromission de l'une ne doit pas compromettre l'autre).

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
from dataclasses import dataclass
from urllib.parse import urlencode

import requests
from cryptography.fernet import Fernet, InvalidToken
from sqlalchemy.orm import Session

from ..models import ROLE_MEMBRE, ROLE_PROPRIETAIRE, Parametre, User
from . import auth_service

CLE_ISSUER = "oidc_issuer"
CLE_CLIENT_ID = "oidc_client_id"
CLE_CLIENT_SECRET_CHIFFRE = "oidc_client_secret_chiffre"
CLE_REDIRECT_URI = "oidc_redirect_uri"
CLE_FRONTEND_URL = "oidc_frontend_url"
CLES_TEXTE = (CLE_ISSUER, CLE_CLIENT_ID, CLE_REDIRECT_URI, CLE_FRONTEND_URL)
TOUTES_LES_CLES = CLES_TEXTE + (CLE_CLIENT_SECRET_CHIFFRE,)

VARIABLE_CLE_CHIFFREMENT = "PATRIMOINE_SECRET_KEY"

STATE_TTL_SECONDES = 300  # 5 minutes : largement suffisant pour l'aller-retour Authentik
SCOPES = "openid profile email"

_discovery_cache: dict[str, dict] = {}


class OidcError(Exception):
    """Toute erreur du flux OIDC destinée à être affichée à l'utilisateur (message
    déjà en français, sûr à renvoyer tel quel dans `?oidc_error=`)."""


class CleChiffrementAbsenteError(RuntimeError):
    """La variable d'environnement `PATRIMOINE_SECRET_KEY` n'est pas définie — cf.
    `docs/MANUEL_EXPLOITATION.md` pour la génération et le déploiement de la clé."""


def _fernet() -> Fernet:
    cle = os.environ.get(VARIABLE_CLE_CHIFFREMENT)
    if not cle:
        raise CleChiffrementAbsenteError(f"{VARIABLE_CLE_CHIFFREMENT} non définie — voir docs/MANUEL_EXPLOITATION.md")
    return Fernet(cle.encode("utf-8"))


def cle_chiffrement_definie() -> bool:
    return bool(os.environ.get(VARIABLE_CLE_CHIFFREMENT))


@dataclass
class OidcConfig:
    issuer: str
    client_id: str
    client_secret: str  # déchiffré, jamais journalisé ni renvoyé par l'API
    redirect_uri: str
    frontend_url: str


def _lire(db: Session, cle: str) -> str | None:
    parametre = db.get(Parametre, cle)
    return parametre.valeur if parametre else None


def _ecrire(db: Session, cle: str, valeur: str) -> None:
    parametre = db.get(Parametre, cle)
    if parametre is None:
        db.add(Parametre(cle=cle, valeur=valeur))
    else:
        parametre.valeur = valeur
    db.commit()


def charger_config(db: Session) -> OidcConfig | None:
    """`None` si un des 4 champs texte manque, si aucun secret n'est enregistré, si
    `PATRIMOINE_SECRET_KEY` est absente, ou si le déchiffrement échoue (`InvalidToken`
    — ex. clé tournée depuis l'enregistrement). Jamais d'exception propagée : cette
    fonction est appelée par `GET /oidc/status`, public et sur le chemin critique de
    la page de connexion."""
    valeurs = {cle: _lire(db, cle) for cle in CLES_TEXTE}
    if any(v is None for v in valeurs.values()):
        return None
    secret_chiffre = _lire(db, CLE_CLIENT_SECRET_CHIFFRE)
    if secret_chiffre is None:
        return None
    try:
        secret = _fernet().decrypt(secret_chiffre.encode("utf-8")).decode("utf-8")
    except (CleChiffrementAbsenteError, InvalidToken):
        return None
    return OidcConfig(
        issuer=valeurs[CLE_ISSUER],
        client_id=valeurs[CLE_CLIENT_ID],
        client_secret=secret,
        redirect_uri=valeurs[CLE_REDIRECT_URI],
        frontend_url=valeurs[CLE_FRONTEND_URL],
    )


def enabled(db: Session) -> bool:
    return charger_config(db) is not None


def config_admin(db: Session) -> dict:
    """Les 4 champs texte + indicateurs booléens — jamais le secret déchiffré, sous
    aucune forme. Pour `GET /oidc/config` (propriétaire)."""
    return {
        "issuer": _lire(db, CLE_ISSUER),
        "client_id": _lire(db, CLE_CLIENT_ID),
        "redirect_uri": _lire(db, CLE_REDIRECT_URI),
        "frontend_url": _lire(db, CLE_FRONTEND_URL),
        "secret_configure": _lire(db, CLE_CLIENT_SECRET_CHIFFRE) is not None,
        "cle_chiffrement_definie": cle_chiffrement_definie(),
    }


def enregistrer_config(
    db: Session, *, issuer: str, client_id: str, redirect_uri: str, frontend_url: str, client_secret: str | None
) -> None:
    """Upsert des 4 lignes texte. `client_secret` fourni (non vide) → chiffré et
    upserté (lève `CleChiffrementAbsenteError` si la clé manque) ; `None`/vide → le
    secret déjà enregistré est conservé tel quel, pour modifier les 4 autres champs
    sans avoir à ressaisir le secret à chaque fois."""
    _ecrire(db, CLE_ISSUER, issuer.strip())
    _ecrire(db, CLE_CLIENT_ID, client_id.strip())
    _ecrire(db, CLE_REDIRECT_URI, redirect_uri.strip())
    _ecrire(db, CLE_FRONTEND_URL, frontend_url.strip())
    if client_secret:
        chiffre = _fernet().encrypt(client_secret.strip().encode("utf-8")).decode("utf-8")
        _ecrire(db, CLE_CLIENT_SECRET_CHIFFRE, chiffre)
    _discovery_cache.clear()


def effacer_config(db: Session) -> None:
    db.query(Parametre).filter(Parametre.cle.in_(TOUTES_LES_CLES)).delete(synchronize_session=False)
    db.commit()
    _discovery_cache.clear()


def _issuer_normalise(issuer: str) -> str:
    return issuer if issuer.endswith("/") else issuer + "/"


def _discovery(issuer: str) -> dict:
    """Découverte OIDC standard (`.well-known/openid-configuration`) plutôt que des
    URLs Authentik codées en dur : robuste aux versions et aux schémas d'URL
    différents d'une instance à l'autre. Mise en cache en mémoire process, clé =
    issuer — invalidée explicitement par `enregistrer_config`/`effacer_config`
    (l'issuer peut changer sans redémarrage du process)."""
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


def _cle_hmac() -> bytes:
    """Réutilise `PATRIMOINE_SECRET_KEY` comme clé HMAC brute pour signer le
    `state` — préoccupation propre à cette application (pas à Authentik), distincte
    du chiffrement Fernet du `client_secret` bien qu'utilisant la même variable
    d'environnement. `construire_state`/`verifier_state` ne sont appelées qu'après le
    garde `enabled(db)` du routeur, donc la clé est garantie présente ici."""
    return (os.environ.get(VARIABLE_CLE_CHIFFREMENT) or "").encode("utf-8")


def construire_state(code_verifier: str) -> str:
    """`state` auto-porteur et signé — aucune table ni session serveur nécessaire
    pour le vérifier au retour d'Authentik (fonctionne même avec plusieurs workers).
    Format : `nonce.horodatage.code_verifier.signature`, chaque partie en base64url."""
    nonce = secrets.token_urlsafe(16)
    horodatage = str(int(time.time()))
    charge = f"{nonce}.{horodatage}.{code_verifier}"
    signature = hmac.new(_cle_hmac(), charge.encode("utf-8"), hashlib.sha256).hexdigest()
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
    signature_attendue = hmac.new(_cle_hmac(), charge.encode("utf-8"), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(signature_recue, signature_attendue):
        raise OidcError("Connexion Authentik invalide (state altéré). Réessayez.")
    if time.time() - int(horodatage) > STATE_TTL_SECONDES:
        raise OidcError("La connexion Authentik a expiré. Réessayez.")
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
        raise OidcError("Authentik a refusé l'échange du code de connexion. Réessayez.")
    corps = reponse.json()
    if "access_token" not in corps:
        raise OidcError("Réponse Authentik inattendue (jeton d'accès manquant). Réessayez.")
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
       logique que `POST /api/auth/register`), sinon `membre` **rattaché au foyer du
       propriétaire déjà en place** (`owner_user_id`, même logique que
       `POST /household-members`) — sans ça, le compte devenait son propre foyer
       vide, sans accès au patrimoine partagé (bug trouvé en vérification bout en
       bout, avant toute mise en production). Jamais un rôle plus privilégié
       auto-attribué à un compte non créé à la main."""
    sub = claims["sub"]
    existant = auth_service.utilisateur_par_oidc_subject(db, sub)
    if existant is not None:
        return existant

    username_souhaite = _nom_utilisateur_depuis_claims(claims)
    par_username = auth_service.utilisateur_par_username(db, username_souhaite)
    if par_username is not None and par_username.oidc_subject is None:
        auth_service.lier_oidc(db, par_username, sub)
        return par_username

    proprietaire = db.query(User).filter(User.role == ROLE_PROPRIETAIRE).first()
    role = ROLE_PROPRIETAIRE if proprietaire is None else ROLE_MEMBRE
    owner_user_id = proprietaire.id if proprietaire is not None else None
    username_final = username_souhaite
    suffixe = 2
    while auth_service.utilisateur_par_username(db, username_final) is not None:
        username_final = f"{username_souhaite[:29]}-{suffixe}"
        suffixe += 1
    return auth_service.creer_utilisateur_oidc(db, username_final, sub, role=role, owner_user_id=owner_user_id)
