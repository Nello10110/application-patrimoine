"""Dépendances FastAPI protégeant les routes existantes (multi-utilisateur, Milestone 1
+ rôles, backlog 2.L.2).

Branchée au niveau de `app.include_router(..., dependencies=[Depends(get_current_user)])`
dans `main.py` pour l'authentification (être connecté), et via `require_role(...)`
pour l'autorisation (avoir le bon rôle) — appliquée soit au niveau routeur (routes
réservées au propriétaire), soit au niveau endpoint (routeurs à granularité mixte,
cf. `main.py` et les routeurs concernés)."""

from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session

from .database import get_db
from .models import AuthToken, User
from .services import auth_service

MESSAGE_NON_AUTHENTIFIE = "Authentification requise."
MESSAGE_ROLE_INSUFFISANT = "Action non autorisée pour ce rôle."


def get_current_token(request: Request, db: Session = Depends(get_db)) -> AuthToken:
    en_tete = request.headers.get("Authorization", "")
    if not en_tete.startswith("Bearer "):
        raise HTTPException(status_code=401, detail=MESSAGE_NON_AUTHENTIFIE)
    token = en_tete.removeprefix("Bearer ").strip()
    auth_token = auth_service.token_par_valeur(db, token) if token else None
    if auth_token is None:
        raise HTTPException(status_code=401, detail=MESSAGE_NON_AUTHENTIFIE)
    # Mise à jour de la dernière activité de la session (2.L.2), affichée dans la
    # liste des sessions de Réglages — coût négligeable (une écriture SQLite locale
    # par requête authentifiée, base mono-foyer).
    auth_service.marquer_session_utilisee(db, auth_token)
    return auth_token


def get_current_user(token_row: AuthToken = Depends(get_current_token), db: Session = Depends(get_db)) -> User:
    user = db.get(User, token_row.user_id)
    if user is None:
        raise HTTPException(status_code=401, detail=MESSAGE_NON_AUTHENTIFIE)
    return user


def require_role(*roles_autorises: str):
    """Dépendance paramétrée : `Depends(require_role(ROLE_PROPRIETAIRE))` sur un
    endpoint, ou `dependencies=[Depends(require_role(...))]` sur un `include_router`."""

    def _dependency(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in roles_autorises:
            raise HTTPException(status_code=403, detail=MESSAGE_ROLE_INSUFFISANT)
        return current_user

    return _dependency
