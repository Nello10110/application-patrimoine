"""Dépendance FastAPI protégeant les routes existantes (multi-utilisateur, Milestone 1).

Branchée au niveau de `app.include_router(..., dependencies=[Depends(get_current_user)])`
dans `main.py` plutôt que sur chaque endpoint individuellement : aucun des routeurs
existants n'a encore besoin de savoir QUI est connecté (aucune table métier n'est
encore scopée par utilisateur, cf. `docs/BACKLOG.md` § 2.I.1) — seul le fait d'être
connecté est vérifié ici. Un futur Milestone 2 (isolation des données par
utilisateur) ajoutera `current_user` explicitement aux endpoints qui en ont
réellement besoin, plutôt que d'anticiper un paramètre inutilisé maintenant."""

from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session

from .database import get_db
from .models import User
from .services import auth_service

MESSAGE_NON_AUTHENTIFIE = "Authentification requise."


def get_current_user(request: Request, db: Session = Depends(get_db)) -> User:
    en_tete = request.headers.get("Authorization", "")
    if not en_tete.startswith("Bearer "):
        raise HTTPException(status_code=401, detail=MESSAGE_NON_AUTHENTIFIE)
    token = en_tete.removeprefix("Bearer ").strip()
    user = auth_service.utilisateur_par_token(db, token) if token else None
    if user is None:
        raise HTTPException(status_code=401, detail=MESSAGE_NON_AUTHENTIFIE)
    return user
