"""Réglages : configuration des tâches planifiées (activation, intervalle,
déclenchement manuel — non bloquant depuis le LOT 4B, cf. `run_job_now` ci-dessous),
consommé par la page Réglages du frontend."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..schemas import ScheduledJobOut, ScheduledJobUpdate
from ..services import market_data_service, scheduler_service

router = APIRouter(prefix="/api/settings", tags=["settings"])


@router.get("/jobs", response_model=list[ScheduledJobOut])
def list_jobs(db: Session = Depends(get_db)):
    return scheduler_service.list_jobs(db)


@router.put("/jobs/{job_key}", response_model=ScheduledJobOut)
def update_job(job_key: str, payload: ScheduledJobUpdate, db: Session = Depends(get_db)):
    if job_key not in scheduler_service.JOBS:
        raise HTTPException(status_code=404, detail="Tâche inconnue")
    return scheduler_service.update_job_config(db, job_key, payload.enabled, payload.intervalle_heures)


@router.post("/jobs/{job_key}/run-now", response_model=ScheduledJobOut, status_code=202)
def run_job_now(job_key: str, db: Session = Depends(get_db)):
    """Démarre l'exécution manuelle sans bloquer la requête (LOT 4B) : renvoie
    tout de suite la config actuelle (202, pas encore mise à jour par cette
    exécution). Le frontend suit la progression via
    `GET /api/market-data/refresh/status` (même exécuteur en tâche de fond que le
    bouton "Rafraîchir les cours" du Portefeuille, cf. `scheduler_service.run_job_now`)
    puis rappelle `GET /api/settings/jobs` une fois terminé pour rafraîchir
    "Dernière exécution"."""
    if job_key not in scheduler_service.JOBS:
        raise HTTPException(status_code=404, detail="Tâche inconnue")
    try:
        return scheduler_service.run_job_now(db, job_key)
    except market_data_service.RafraichissementDejaEnCoursError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
