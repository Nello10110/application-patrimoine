"""Gestion des liens de partage révocables (backlog 2.Q.1) — réservée au
propriétaire (cf. `main.py`, `_proprietaire_seul`), comme les autres réglages de
sécurité (2.L.2). Les routes PUBLIQUES de consultation (aucune authentification)
sont dans `routers/partage_public.py`, volontairement un fichier séparé pour
qu'aucune dépendance d'authentification ne puisse s'y glisser par erreur."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..database import get_db
from ..models import Detenteur, LienPartage, User
from ..schemas import LienPartageCreate, LienPartageOut
from ..services import auth_service, partage_service

router = APIRouter(prefix="/api/partage", tags=["partage"])


def _serialiser(lien: LienPartage) -> LienPartageOut:
    return LienPartageOut(
        id=lien.id,
        token=lien.token,
        nom=lien.nom,
        detenteur_id=lien.detenteur_id,
        inclure_patrimoine_net=lien.inclure_patrimoine_net,
        inclure_repartition=lien.inclure_repartition,
        inclure_performance=lien.inclure_performance,
        inclure_budget=lien.inclure_budget,
        inclure_objectifs=lien.inclure_objectifs,
        masquer_valeurs=lien.masquer_valeurs,
        code_requis=lien.code_hash is not None,
        created_at=lien.created_at,
        expires_at=lien.expires_at,
        revoked_at=lien.revoked_at,
    )


@router.get("", response_model=list[LienPartageOut])
def list_liens(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return [_serialiser(lien) for lien in partage_service.lister_liens(db, auth_service.id_foyer(current_user))]


@router.post("", response_model=LienPartageOut)
def create_lien(payload: LienPartageCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    user_id = auth_service.id_foyer(current_user)
    if payload.detenteur_id is not None:
        detenteur = db.get(Detenteur, payload.detenteur_id)
        if detenteur is None or detenteur.user_id != user_id:
            raise HTTPException(status_code=404, detail="Détenteur introuvable")
    lien = partage_service.creer_lien(db, user_id, **payload.model_dump())
    return _serialiser(lien)


@router.delete("/{lien_id}")
def revoke_lien(lien_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    lien = partage_service.lien_du_foyer(db, auth_service.id_foyer(current_user), lien_id)
    if lien is None:
        raise HTTPException(status_code=404, detail="Lien introuvable")
    partage_service.revoquer_lien(db, lien)
    return {"ok": True}
