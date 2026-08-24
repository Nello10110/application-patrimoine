"""Objectifs suivis dans le temps et indicateurs de situation (backlog 2.O.1/2.O.2).
Distinct de `routers/targets.py` (objectifs de répartition géo/sectorielle,
§ 2.C/roadmap Phase 4) — deux notions différentes qui partagent le mot « objectif »
dans le texte du backlog, pas dans le modèle de données. Enregistré `_proprietaire_seul`
dans `main.py`, même classification que `targets.router`."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..database import get_db
from ..models import User
from ..schemas import IndicateursSituation, ObjectifCreate, ObjectifDetail
from ..services import auth_service, objectifs_service

router = APIRouter(prefix="/api/objectifs", tags=["objectifs"])


@router.get("/", response_model=list[ObjectifDetail])
def list_objectifs(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return objectifs_service.list_objectifs_detail(db, auth_service.id_foyer(current_user))


@router.post("/", response_model=ObjectifDetail)
def create_objectif(payload: ObjectifCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    try:
        objectif = objectifs_service.create_objectif(
            db,
            auth_service.id_foyer(current_user),
            payload.nom,
            payload.type,
            payload.montant_cible,
            payload.echeance,
            payload.rendement_hypothese_pct,
            payload.holding_ids,
            payload.detenteur_ids,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return objectifs_service.compute_detail(db, auth_service.id_foyer(current_user), objectif)


@router.get("/{objectif_id}", response_model=ObjectifDetail)
def get_objectif(objectif_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    try:
        return objectifs_service.get_objectif_detail(db, auth_service.id_foyer(current_user), objectif_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.delete("/{objectif_id}", status_code=204)
def delete_objectif(objectif_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    try:
        objectifs_service.delete_objectif(db, auth_service.id_foyer(current_user), objectif_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/situation/indicateurs", response_model=IndicateursSituation)
def indicateurs_situation(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return objectifs_service.compute_indicateurs_situation(db, auth_service.id_foyer(current_user))
