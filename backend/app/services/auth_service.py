"""Mots de passe, jetons de session, rôles et journal d'accès (multi-utilisateur,
Milestone 1 + backlog 2.L.2).

Hachage via `hashlib.pbkdf2_hmac` de la bibliothèque standard plutôt qu'une
dépendance externe (`passlib`/`bcrypt`) — cohérent avec la philosophie déjà
appliquée dans ce projet (`html.parser` plutôt que `lxml`, `bisect` plutôt qu'une
dépendance de recherche...). Le nombre d'itérations est stocké dans le hash lui-même
(format `pbkdf2_sha256$<iterations>$<sel>$<hash>`) pour pouvoir l'augmenter plus
tard sans invalider les mots de passe déjà enregistrés.
"""

import hashlib
import secrets
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from ..models import ROLE_PROPRIETAIRE, AccessLogEntry, AuthToken, User

PBKDF2_ITERATIONS = 260_000
TOKEN_TTL_JOURS = 30

# Verrouillage temporaire (2.L.2) : dérivé du journal d'accès lui-même plutôt qu'un
# compteur mutable séparé sur `User` — une seule source de vérité, qui alimente
# aussi le journal consultable dans Réglages.
SEUIL_TENTATIVES = 5
FENETRE_VERROUILLAGE_MINUTES = 15
DUREE_VERROUILLAGE_MINUTES = 15


def _maintenant_naif() -> datetime:
    """Même convention que `loan_service.maintenant_naif` : horodatage naïf (UTC
    implicite), SQLite ne conservant pas `tzinfo` — comparer un `datetime` naïf lu en
    base à un `datetime.now(timezone.utc)` aware lèverait une `TypeError`."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def hash_password(password: str) -> str:
    sel = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), sel.encode("utf-8"), PBKDF2_ITERATIONS)
    return f"pbkdf2_sha256${PBKDF2_ITERATIONS}${sel}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        algo, iterations_str, sel, hash_attendu = stored.split("$")
    except ValueError:
        return False
    if algo != "pbkdf2_sha256":
        return False
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), sel.encode("utf-8"), int(iterations_str))
    return secrets.compare_digest(digest.hex(), hash_attendu)


def utilisateur_par_username(db: Session, username: str) -> User | None:
    return db.query(User).filter(User.username == username.strip()).first()


def id_foyer(user: User) -> int:
    """Identifiant de compte propriétaire des données consultées/modifiées : celui de
    l'utilisateur lui-même pour un propriétaire, celui de son `owner_user_id` pour un
    membre/invité — permet à tous les routeurs de continuer à filtrer par un seul
    `user_id`, sans dupliquer la logique de rattachement au foyer à chaque endroit."""
    return user.owner_user_id or user.id


def creer_utilisateur(db: Session, username: str, password: str, *, role: str = ROLE_PROPRIETAIRE, owner_user_id: int | None = None) -> User:
    user = User(username=username.strip(), password_hash=hash_password(password), role=role, owner_user_id=owner_user_id)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def creer_utilisateur_oidc(
    db: Session,
    username: str,
    oidc_subject: str,
    *,
    role: str = ROLE_PROPRIETAIRE,
    owner_user_id: int | None = None,
    email: str | None = None,
    nom: str | None = None,
) -> User:
    """Miroir de `creer_utilisateur` pour un compte provisionné via SSO (OIDC) —
    `password_hash=None` : ce compte ne peut jamais se connecter par mot de passe,
    seulement via `oidc_subject` (cf. `POST /api/auth/login`, qui refuse explicitement
    un mot de passe sur un compte sans hash). `email`/`nom` : métadonnées d'affichage
    issues du claim mapping (cf. `services/oidc_service.py`), jamais utilisées pour
    l'authentification."""
    user = User(
        username=username.strip(),
        password_hash=None,
        oidc_subject=oidc_subject,
        role=role,
        owner_user_id=owner_user_id,
        email=email,
        nom=nom,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def utilisateur_par_oidc_subject(db: Session, oidc_subject: str) -> User | None:
    return db.query(User).filter(User.oidc_subject == oidc_subject).first()


def mettre_a_jour_profil_oidc(db: Session, user: User, *, email: str | None, nom: str | None) -> None:
    """Resynchronise `email`/`nom` à chaque connexion SSO (backlog SSO, claim
    mapping) — jamais `username`, qui reste l'identifiant de connexion figé après sa
    création (cf. docstring de `User`). `None` n'efface pas une valeur déjà connue :
    un claim absent d'une connexion donnée (IdP mal configuré momentanément, scope
    refusé...) ne doit pas faire disparaître une métadonnée déjà correcte."""
    if email:
        user.email = email
    if nom:
        user.nom = nom
    db.commit()


def lier_oidc(db: Session, user: User, oidc_subject: str) -> None:
    """Ajoute le SSO comme second moyen de connexion à un compte déjà créé à la
    main (même `username`) — le mot de passe existant, s'il y en a un, reste utilisable
    tel quel : lier ne retire jamais un moyen de connexion, seulement en ajoute un."""
    user.oidc_subject = oidc_subject
    db.commit()


def creer_token(db: Session, user: User, *, ip: str | None = None, user_agent: str | None = None) -> AuthToken:
    maintenant = _maintenant_naif()
    token = AuthToken(
        token=secrets.token_hex(32),
        id_session=secrets.token_hex(8),
        user_id=user.id,
        created_at=maintenant,
        expires_at=maintenant + timedelta(days=TOKEN_TTL_JOURS),
        derniere_utilisation=maintenant,
        ip=ip,
        user_agent=user_agent,
    )
    db.add(token)
    db.commit()
    return token


def token_par_valeur(db: Session, token: str) -> AuthToken | None:
    """`None` si le jeton est absent, ou présent mais expiré — un jeton expiré n'est
    pas purgé ici (pas de conséquence : il ne redonne jamais accès), un futur nettoyage
    périodique pourrait le faire mais n'a rien d'urgent pour ce volume de données."""
    auth_token = db.get(AuthToken, token)
    if auth_token is None:
        return None
    if auth_token.expires_at < _maintenant_naif():
        return None
    return auth_token


def utilisateur_par_token(db: Session, token: str) -> User | None:
    auth_token = token_par_valeur(db, token)
    if auth_token is None:
        return None
    return db.get(User, auth_token.user_id)


def marquer_session_utilisee(db: Session, auth_token: AuthToken) -> None:
    auth_token.derniere_utilisation = _maintenant_naif()
    db.commit()


def supprimer_token(db: Session, token: str) -> None:
    db.query(AuthToken).filter(AuthToken.token == token).delete()
    db.commit()


def lister_sessions(db: Session, user_id: int) -> list[AuthToken]:
    return db.query(AuthToken).filter(AuthToken.user_id == user_id).order_by(AuthToken.derniere_utilisation.desc()).all()


def session_par_id(db: Session, id_session: str) -> AuthToken | None:
    return db.query(AuthToken).filter(AuthToken.id_session == id_session).first()


def revoquer_session(db: Session, auth_token: AuthToken) -> None:
    db.delete(auth_token)
    db.commit()


def journaliser_acces(db: Session, username: str, user_id: int | None, ip: str | None, resultat: str, raison: str | None, *, action: str = "login") -> None:
    entree = AccessLogEntry(username_saisi=username.strip(), user_id=user_id, ip=ip, action=action, resultat=resultat, raison=raison)
    db.add(entree)
    db.commit()


def lister_journal_acces(db: Session, page: int, page_size: int) -> list[AccessLogEntry]:
    """Journal global (pas filtré par foyer) : seul un propriétaire y accède
    (`require_role(ROLE_PROPRIETAIRE)`), et la connexion elle-même précède la
    résolution de tout foyer — un échec sur un identifiant inconnu n'a par
    construction aucun foyer auquel le rattacher."""
    decalage = max(page - 1, 0) * page_size
    return db.query(AccessLogEntry).order_by(AccessLogEntry.timestamp.desc()).offset(decalage).limit(page_size).all()


def verrouillage_actif(db: Session, username: str) -> datetime | None:
    """5 échecs (mot de passe incorrect ou compte inconnu) en `FENETRE_VERROUILLAGE_MINUTES`
    minutes glissantes ⇒ verrouillage de `DUREE_VERROUILLAGE_MINUTES` minutes à partir
    du 5e échec. Les rejets `raison="compte_verrouille"` sont exclus du calcul : sinon
    le verrouillage s'auto-prolongerait indéfiniment tant que l'attaquant continue de
    frapper pendant la fenêtre."""
    # Tri croissant : le déclencheur du verrouillage est le 5e échec chronologique
    # (index SEUIL_TENTATIVES - 1) — en pratique jamais plus de SEUIL_TENTATIVES
    # échecs "réels" ne s'accumulent dans la fenêtre, puisque ce verrou est vérifié
    # AVANT toute tentative de mot de passe dans `login` : une fois déclenché, les
    # tentatives suivantes sont journalisées en `raison="compte_verrouille"`
    # (exclues ici) plutôt qu'en nouvel échec de mot de passe.
    maintenant = _maintenant_naif()
    depuis = maintenant - timedelta(minutes=FENETRE_VERROUILLAGE_MINUTES)
    echecs = (
        db.query(AccessLogEntry)
        .filter(
            AccessLogEntry.username_saisi == username.strip(),
            AccessLogEntry.action == "login",
            AccessLogEntry.resultat == "echec",
            AccessLogEntry.raison != "compte_verrouille",
            AccessLogEntry.timestamp >= depuis,
        )
        .order_by(AccessLogEntry.timestamp.asc())
        .all()
    )
    if len(echecs) < SEUIL_TENTATIVES:
        return None
    declencheur = echecs[SEUIL_TENTATIVES - 1].timestamp
    fin_verrouillage = declencheur + timedelta(minutes=DUREE_VERROUILLAGE_MINUTES)
    return fin_verrouillage if fin_verrouillage > maintenant else None
