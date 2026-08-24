"""Connexion SSO via un fournisseur OIDC (backlog SSO) — pas lié à une stack
particulière : le fournisseur (Authentik, Keycloak, Zitadel, Okta...) est entièrement
configuré depuis Réglages, jamais codé en dur dans ce module. L'utilisateur de ce
déploiement utilise Authentik en pratique (mentionné ici et dans la documentation à
titre d'exemple concret), mais rien dans ce code ne le suppose.

Point de sécurité central de ce module, à ne jamais perdre de vue : il ne fait
JAMAIS confiance à un en-tête envoyé par un proxy (`X-authentik-*`/`X-forwarded-*`
ou équivalent). Un proxy provider protège déjà l'application en amont pour certains
déploiements — mais cette protection peut être retirée un jour, et ce module doit
rester tout aussi sûr ce jour-là. Toute la confiance vient d'un échange direct,
serveur à serveur, authentifié par le `client_secret` (jamais transmis au
navigateur) : l'échange du code d'autorisation contre un jeton d'accès, puis l'appel
`userinfo` avec ce jeton. Retirer un éventuel proxy en amont n'a donc aucun effet sur
la sécurité de ce flux.

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
CLE_ENABLED = "oidc_config_enabled"
CLE_DISPLAY_NAME = "oidc_display_name"
CLE_CLAIM_USERNAME = "oidc_claim_username"
CLE_CLAIM_EMAIL = "oidc_claim_email"
CLE_CLAIM_NOM = "oidc_claim_nom"
CLES_TEXTE = (CLE_ISSUER, CLE_CLIENT_ID, CLE_REDIRECT_URI, CLE_FRONTEND_URL)
# Clés facultatives : jamais requises pour qu'une configuration soit "complète"
# (`charger_config`), toujours lues avec un repli sensé si absentes.
CLES_FACULTATIVES = (CLE_ENABLED, CLE_DISPLAY_NAME, CLE_CLAIM_USERNAME, CLE_CLAIM_EMAIL, CLE_CLAIM_NOM)
TOUTES_LES_CLES = CLES_TEXTE + CLES_FACULTATIVES + (CLE_CLIENT_SECRET_CHIFFRE,)

VARIABLE_CLE_CHIFFREMENT = "PATRIMOINE_SECRET_KEY"

STATE_TTL_SECONDES = 300  # 5 minutes : largement suffisant pour l'aller-retour vers le fournisseur SSO
SCOPES = "openid profile email"

DISPLAY_NAME_PAR_DEFAUT = "SSO"
# Claims standard des scopes OIDC `profile`/`email` (déjà demandés ci-dessus) — repris
# tels quels par la plupart des fournisseurs, personnalisables depuis Réglages si le
# fournisseur utilisé s'en écarte.
CLAIM_USERNAME_PAR_DEFAUT = "preferred_username"
CLAIM_EMAIL_PAR_DEFAUT = "email"
CLAIM_NOM_PAR_DEFAUT = "name"

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
    display_name: str
    claim_username: str
    claim_email: str
    claim_nom: str


def _lire(db: Session, cle: str) -> str | None:
    parametre = db.get(Parametre, cle)
    return parametre.valeur if parametre else None


def _lire_avec_defaut(db: Session, cle: str, defaut: str) -> str:
    return _lire(db, cle) or defaut


def _lire_bool(db: Session, cle: str, defaut: bool) -> bool:
    valeur = _lire(db, cle)
    return defaut if valeur is None else valeur == "1"


def _ecrire(db: Session, cle: str, valeur: str) -> None:
    parametre = db.get(Parametre, cle)
    if parametre is None:
        db.add(Parametre(cle=cle, valeur=valeur))
    else:
        parametre.valeur = valeur
    db.commit()


def charger_config(db: Session) -> OidcConfig | None:
    """`None` si un des 4 champs texte obligatoires manque, si aucun secret n'est
    enregistré, si `PATRIMOINE_SECRET_KEY` est absente, si le déchiffrement échoue
    (`InvalidToken` — ex. clé tournée depuis l'enregistrement), ou si la coche
    « Activée » est décochée — désactiver revient, du point de vue de cette fonction
    (et donc de `/oidc/status`/`/oidc/login`/`/oidc/callback`), exactement à une
    configuration incomplète. Jamais d'exception propagée : cette fonction est
    appelée par `GET /oidc/status`, public et sur le chemin critique de la page de
    connexion."""
    if not _lire_bool(db, CLE_ENABLED, True):
        return None
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
        display_name=_lire_avec_defaut(db, CLE_DISPLAY_NAME, DISPLAY_NAME_PAR_DEFAUT),
        claim_username=_lire_avec_defaut(db, CLE_CLAIM_USERNAME, CLAIM_USERNAME_PAR_DEFAUT),
        claim_email=_lire_avec_defaut(db, CLE_CLAIM_EMAIL, CLAIM_EMAIL_PAR_DEFAUT),
        claim_nom=_lire_avec_defaut(db, CLE_CLAIM_NOM, CLAIM_NOM_PAR_DEFAUT),
    )


def enabled(db: Session) -> bool:
    return charger_config(db) is not None


def config_admin(db: Session) -> dict:
    """Les champs texte + indicateurs booléens — jamais le secret déchiffré, sous
    aucune forme. `enabled` est lu indépendamment du garde de `charger_config`, pour
    que la coche reflète toujours son état réel même quand elle est décochée (sinon
    impossible de la recocher depuis Réglages). Pour `GET /oidc/config` (propriétaire)."""
    return {
        "issuer": _lire(db, CLE_ISSUER),
        "client_id": _lire(db, CLE_CLIENT_ID),
        "redirect_uri": _lire(db, CLE_REDIRECT_URI),
        "frontend_url": _lire(db, CLE_FRONTEND_URL),
        "secret_configure": _lire(db, CLE_CLIENT_SECRET_CHIFFRE) is not None,
        "cle_chiffrement_definie": cle_chiffrement_definie(),
        "enabled": _lire_bool(db, CLE_ENABLED, True),
        "display_name": _lire_avec_defaut(db, CLE_DISPLAY_NAME, DISPLAY_NAME_PAR_DEFAUT),
        "claim_username": _lire_avec_defaut(db, CLE_CLAIM_USERNAME, CLAIM_USERNAME_PAR_DEFAUT),
        "claim_email": _lire_avec_defaut(db, CLE_CLAIM_EMAIL, CLAIM_EMAIL_PAR_DEFAUT),
        "claim_nom": _lire_avec_defaut(db, CLE_CLAIM_NOM, CLAIM_NOM_PAR_DEFAUT),
    }


def enregistrer_config(
    db: Session,
    *,
    issuer: str,
    client_id: str,
    redirect_uri: str,
    frontend_url: str,
    client_secret: str | None,
    enabled: bool = True,
    display_name: str | None = None,
    claim_username: str | None = None,
    claim_email: str | None = None,
    claim_nom: str | None = None,
) -> None:
    """Upsert des champs texte + de la coche d'activation. `client_secret` fourni
    (non vide) → chiffré et upserté (lève `CleChiffrementAbsenteError` si la clé
    manque) ; `None`/vide → le secret déjà enregistré est conservé tel quel, pour
    modifier les autres champs sans avoir à ressaisir le secret à chaque fois.
    `display_name`/`claim_*` vides ou omis → repli sur leur valeur par défaut plutôt
    que d'enregistrer une chaîne vide (évite un champ Réglages laissé vide par
    inadvertance qui casserait silencieusement le mapping)."""
    _ecrire(db, CLE_ISSUER, issuer.strip())
    _ecrire(db, CLE_CLIENT_ID, client_id.strip())
    _ecrire(db, CLE_REDIRECT_URI, redirect_uri.strip())
    _ecrire(db, CLE_FRONTEND_URL, frontend_url.strip())
    _ecrire(db, CLE_ENABLED, "1" if enabled else "0")
    _ecrire(db, CLE_DISPLAY_NAME, (display_name or "").strip() or DISPLAY_NAME_PAR_DEFAUT)
    _ecrire(db, CLE_CLAIM_USERNAME, (claim_username or "").strip() or CLAIM_USERNAME_PAR_DEFAUT)
    _ecrire(db, CLE_CLAIM_EMAIL, (claim_email or "").strip() or CLAIM_EMAIL_PAR_DEFAUT)
    _ecrire(db, CLE_CLAIM_NOM, (claim_nom or "").strip() or CLAIM_NOM_PAR_DEFAUT)
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
    URLs codées en dur pour un fournisseur particulier : robuste aux versions et aux
    schémas d'URL différents d'un fournisseur à l'autre. Mise en cache en mémoire
    process, clé = issuer — invalidée explicitement par
    `enregistrer_config`/`effacer_config` (l'issuer peut changer sans redémarrage)."""
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
    `state` — préoccupation propre à cette application (pas au fournisseur SSO),
    distincte du chiffrement Fernet du `client_secret` bien qu'utilisant la même
    variable d'environnement. `construire_state`/`verifier_state` ne sont appelées
    qu'après le garde `enabled(db)` du routeur, donc la clé est garantie présente ici."""
    return (os.environ.get(VARIABLE_CLE_CHIFFREMENT) or "").encode("utf-8")


def construire_state(code_verifier: str) -> str:
    """`state` auto-porteur et signé — aucune table ni session serveur nécessaire
    pour le vérifier au retour du fournisseur SSO (fonctionne même avec plusieurs
    workers). Format : `nonce.horodatage.code_verifier.signature`, chaque partie en
    base64url."""
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
        raise OidcError("Connexion SSO invalide (state malformé). Réessayez.")
    nonce, horodatage, code_verifier, signature_recue = parties
    charge = f"{nonce}.{horodatage}.{code_verifier}"
    signature_attendue = hmac.new(_cle_hmac(), charge.encode("utf-8"), hashlib.sha256).hexdigest()
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
