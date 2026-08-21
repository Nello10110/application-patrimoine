"""CRUD des détenteurs (personnes/sociétés du foyer, backlog 2.L.1) — distincts des
comptes de connexion (`User`)."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..database import get_db
from ..models import Detenteur, User
from ..schemas import DetenteurCreate, DetenteurOut, DetenteurUpdate
from ..services import auth_service, detenteurs_service

router = APIRouter(prefix="/api/detenteurs", tags=["detenteurs"])


@router.get("", response_model=list[DetenteurOut])
def list_detenteurs(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return detenteurs_service.list_detenteurs(db, auth_service.id_foyer(current_user))


@router.post("", response_model=DetenteurOut)
def create_detenteur(payload: DetenteurCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return detenteurs_service.create_detenteur(db, auth_service.id_foyer(current_user), payload.nom, payload.type)


@router.patch("/{detenteur_id}", response_model=DetenteurOut)
def update_detenteur(
    detenteur_id: int,
    payload: DetenteurUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    detenteur = db.get(Detenteur, detenteur_id)
    if detenteur is None or detenteur.user_id != auth_service.id_foyer(current_user):
        raise HTTPException(status_code=404, detail="Détenteur introuvable")
    return detenteurs_service.update_detenteur(db, detenteur, **payload.model_dump(exclude_unset=True))


@router.delete("/{detenteur_id}")
def delete_detenteur(detenteur_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    detenteur = db.get(Detenteur, detenteur_id)
    if detenteur is None or detenteur.user_id != auth_service.id_foyer(current_user):
        raise HTTPException(status_code=404, detail="Détenteur introuvable")
    detenteurs_service.delete_detenteur(db, detenteur)
    return {"ok": True}
