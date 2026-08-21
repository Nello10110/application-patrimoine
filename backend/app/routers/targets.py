"""Objectifs de répartition géo/sectorielle par année (CRUD + valeurs par défaut).
Note d'ordre des routes : `/defaults` et `/` sont déclarées avant `/{annee}` pour
que FastAPI ne tente pas de convertir ces segments littéraux en `int`."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..database import get_db
from ..models import AllocationTarget, User
from ..schemas import AllocationTargetOut, AllocationTargetsSet
from ..services import auth_service
from ..services.reference_indices import DEFAULT_GEO_TARGETS, DEFAULT_SECTOR_TARGETS

router = APIRouter(prefix="/api/targets", tags=["targets"])


@router.get("/defaults")
def get_defaults():
    return {
        "geo": [{"categorie": k, "pourcentage_cible": v} for k, v in DEFAULT_GEO_TARGETS.items()],
        "sector": [{"categorie": k, "pourcentage_cible": v} for k, v in DEFAULT_SECTOR_TARGETS.items()],
    }


@router.get("/", response_model=list[int])
def list_years(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    rows = (
        db.query(AllocationTarget.annee)
        .filter(AllocationTarget.user_id == auth_service.id_foyer(current_user))
        .distinct()
        .order_by(AllocationTarget.annee.desc())
        .all()
    )
    return [r[0] for r in rows]


@router.get("/{annee}", response_model=list[AllocationTargetOut])
def get_targets(annee: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return db.query(AllocationTarget).filter(AllocationTarget.user_id == auth_service.id_foyer(current_user), AllocationTarget.annee == annee).all()


@router.put("/{annee}", response_model=list[AllocationTargetOut])
def set_targets(annee: int, payload: AllocationTargetsSet, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if annee != payload.annee:
        raise HTTPException(status_code=400, detail="L'année de l'URL et du payload doivent correspondre")

    for group, type_ in ((payload.geo, "geo"), (payload.sector, "sector")):
        total = sum(item.pourcentage_cible for item in group)
        if group and abs(total - 100) > 0.5:
            raise HTTPException(
                status_code=400,
                detail=f"La répartition '{type_}' doit sommer à 100% (actuellement {total:.1f}%)",
            )

    db.query(AllocationTarget).filter(AllocationTarget.user_id == auth_service.id_foyer(current_user), AllocationTarget.annee == annee).delete()

    for item in payload.geo:
        db.add(
            AllocationTarget(
                user_id=auth_service.id_foyer(current_user), annee=annee, type="geo", categorie=item.categorie, pourcentage_cible=item.pourcentage_cible
            )
        )
    for item in payload.sector:
        db.add(
            AllocationTarget(
                user_id=auth_service.id_foyer(current_user), annee=annee, type="sector", categorie=item.categorie, pourcentage_cible=item.pourcentage_cible
            )
        )

    db.commit()
    return db.query(AllocationTarget).filter(AllocationTarget.user_id == auth_service.id_foyer(current_user), AllocationTarget.annee == annee).all()
