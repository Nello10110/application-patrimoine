"""Inscription/connexion (multi-utilisateur, Milestone 1). `register`/`login` sont les
deux seules routes de toute l'API à rester accessibles sans jeton — cf. `main.py`, qui
protège tous les autres routeurs via `dependencies=[Depends(get_current_user)]`."""

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..database import get_db
from ..models import User
from ..schemas import AuthResponse, LoginRequest, RegisterRequest, UserOut
from ..services import auth_service

router = APIRouter(prefix="/api/auth", tags=["auth"])

MESSAGE_EMAIL_DEJA_UTILISE = "Un compte existe déjà avec cet email."
MESSAGE_IDENTIFIANTS_INVALIDES = "Email ou mot de passe incorrect."


@router.post("/register", response_model=AuthResponse)
def register(payload: RegisterRequest, db: Session = Depends(get_db)):
    if auth_service.utilisateur_par_email(db, payload.email) is not None:
        raise HTTPException(status_code=400, detail=MESSAGE_EMAIL_DEJA_UTILISE)
    user = auth_service.creer_utilisateur(db, payload.email, payload.password)
    token = auth_service.creer_token(db, user)
    return AuthResponse(token=token.token, user=UserOut.model_validate(user))


@router.post("/login", response_model=AuthResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    user = auth_service.utilisateur_par_email(db, payload.email)
    if user is None or not auth_service.verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail=MESSAGE_IDENTIFIANTS_INVALIDES)
    token = auth_service.creer_token(db, user)
    return AuthResponse(token=token.token, user=UserOut.model_validate(user))


@router.post("/logout", status_code=204)
def logout(request: Request, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    en_tete = request.headers.get("Authorization", "")
    token = en_tete.removeprefix("Bearer ").strip()
    auth_service.supprimer_token(db, token)


@router.get("/me", response_model=UserOut)
def me(current_user: User = Depends(get_current_user)):
    return UserOut.model_validate(current_user)
