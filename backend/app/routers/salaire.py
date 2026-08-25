"""Calculateur brut/net + taux d'épargne annuel du foyer (une ligne `Salaire` par
année). Réservé au propriétaire (protection au niveau `include_router` dans `main.py`,
même niveau de sensibilité que les Objectifs) : donnée de revenu personnel."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..auth import get_current_user
from ..models import User
from ..schemas import SalaireIn, SalaireResume
from ..services import auth_service, salaire_service

router = APIRouter(prefix="/api/salaire", tags=["salaire"])


@router.get("/", response_model=list[SalaireResume])
def list_salaires(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    user_id = auth_service.id_foyer(current_user)
    return [salaire_service.resume_depuis_ligne(db, ligne) for ligne in salaire_service.list_salaires(db, user_id)]


@router.get("/{annee}", response_model=SalaireResume)
def get_salaire(annee: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    user_id = auth_service.id_foyer(current_user)
    ligne = salaire_service.get_salaire(db, user_id, annee)
    if ligne is None:
        raise HTTPException(status_code=404, detail=f"Aucun salaire saisi pour l'année {annee}")
    return salaire_service.resume_depuis_ligne(db, ligne)


@router.put("/{annee}", response_model=SalaireResume)
def set_salaire(annee: int, payload: SalaireIn, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    user_id = auth_service.id_foyer(current_user)
    ligne = salaire_service.upsert_salaire(
        db,
        user_id,
        annee,
        montant=payload.montant,
        type_montant=payload.type_montant,
        periodicite=payload.periodicite,
        statut=payload.statut,
        nombre_mois=payload.nombre_mois,
    )
    return salaire_service.resume_depuis_ligne(db, ligne)


@router.delete("/{annee}", status_code=204)
def delete_salaire(annee: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    user_id = auth_service.id_foyer(current_user)
    if not salaire_service.delete_salaire(db, user_id, annee):
        raise HTTPException(status_code=404, detail=f"Aucun salaire saisi pour l'année {annee}")
