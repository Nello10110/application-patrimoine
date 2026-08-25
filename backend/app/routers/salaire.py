"""Calculateur brut/net + taux d'épargne annuel du foyer. Plusieurs entrées `Salaire`
possibles par année (un revenu par conjoint, par exemple), chacune avec son propre taux
d'imposition. Réservé au propriétaire (protection au niveau `include_router` dans
`main.py`, même niveau de sensibilité que les Objectifs) : donnée de revenu personnel."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..auth import get_current_user
from ..models import User
from ..schemas import SalaireDonnees, SalaireIn, SalaireResume, SyntheseAnnee
from ..services import auth_service, salaire_service

router = APIRouter(prefix="/api/salaire", tags=["salaire"])


@router.get("/", response_model=SalaireDonnees)
def list_salaires(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    user_id = auth_service.id_foyer(current_user)
    entrees = [salaire_service.resume_depuis_ligne(ligne) for ligne in salaire_service.list_salaires(db, user_id)]
    syntheses = [salaire_service.compute_synthese_annee(db, user_id, annee) for annee in salaire_service.annees_avec_salaire(db, user_id)]
    return {"entrees": entrees, "syntheses": syntheses}


@router.get("/synthese/{annee}", response_model=SyntheseAnnee)
def get_synthese_annee(annee: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    user_id = auth_service.id_foyer(current_user)
    return salaire_service.compute_synthese_annee(db, user_id, annee)


@router.post("/", response_model=SalaireResume)
def create_salaire(payload: SalaireIn, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    user_id = auth_service.id_foyer(current_user)
    ligne = salaire_service.create_salaire(
        db,
        user_id,
        annee=payload.annee,
        nom=payload.nom,
        montant=payload.montant,
        type_montant=payload.type_montant,
        periodicite=payload.periodicite,
        statut=payload.statut,
        nombre_mois=payload.nombre_mois,
        taux_imposition_pct=payload.taux_imposition_pct,
    )
    return salaire_service.resume_depuis_ligne(ligne)


@router.put("/{salaire_id}", response_model=SalaireResume)
def update_salaire(salaire_id: int, payload: SalaireIn, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    user_id = auth_service.id_foyer(current_user)
    ligne = salaire_service.update_salaire(
        db,
        user_id,
        salaire_id,
        annee=payload.annee,
        nom=payload.nom,
        montant=payload.montant,
        type_montant=payload.type_montant,
        periodicite=payload.periodicite,
        statut=payload.statut,
        nombre_mois=payload.nombre_mois,
        taux_imposition_pct=payload.taux_imposition_pct,
    )
    if ligne is None:
        raise HTTPException(status_code=404, detail="Salaire introuvable")
    return salaire_service.resume_depuis_ligne(ligne)


@router.delete("/{salaire_id}", status_code=204)
def delete_salaire(salaire_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    user_id = auth_service.id_foyer(current_user)
    if not salaire_service.delete_salaire(db, user_id, salaire_id):
        raise HTTPException(status_code=404, detail="Salaire introuvable")
