"""Mots de passe et jetons de session (multi-utilisateur, Milestone 1).

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

from ..models import AuthToken, User

PBKDF2_ITERATIONS = 260_000
TOKEN_TTL_JOURS = 30


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


def utilisateur_par_email(db: Session, email: str) -> User | None:
    return db.query(User).filter(User.email == email.strip().lower()).first()


def creer_utilisateur(db: Session, email: str, password: str) -> User:
    user = User(email=email.strip().lower(), password_hash=hash_password(password))
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def creer_token(db: Session, user: User) -> AuthToken:
    maintenant = _maintenant_naif()
    token = AuthToken(
        token=secrets.token_hex(32),
        user_id=user.id,
        created_at=maintenant,
        expires_at=maintenant + timedelta(days=TOKEN_TTL_JOURS),
    )
    db.add(token)
    db.commit()
    return token


def utilisateur_par_token(db: Session, token: str) -> User | None:
    """`None` si le jeton est absent, ou présent mais expiré — un jeton expiré n'est
    pas purgé ici (pas de conséquence : il ne redonne jamais accès), un futur nettoyage
    périodique pourrait le faire mais n'a rien d'urgent pour ce volume de données."""
    auth_token = db.get(AuthToken, token)
    if auth_token is None:
        return None
    if auth_token.expires_at < _maintenant_naif():
        return None
    return db.get(User, auth_token.user_id)


def supprimer_token(db: Session, token: str) -> None:
    db.query(AuthToken).filter(AuthToken.token == token).delete()
    db.commit()
