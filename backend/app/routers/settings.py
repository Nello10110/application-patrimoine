"""Réglages : configuration des tâches planifiées (activation, intervalle,
déclenchement manuel), consommé par la page Réglages du frontend."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..schemas import ScheduledJobOut, ScheduledJobUpdate
from ..services import scheduler_service

router = APIRouter(prefix="/api/settings", tags=["settings"])


@router.get("/jobs", response_model=list[ScheduledJobOut])
def list_jobs(db: Session = Depends(get_db)):
    return scheduler_service.list_jobs(db)


@router.put("/jobs/{job_key}", response_model=ScheduledJobOut)
def update_job(job_key: str, payload: ScheduledJobUpdate, db: Session = Depends(get_db)):
    if job_key not in scheduler_service.JOBS:
        raise HTTPException(status_code=404, detail="Tâche inconnue")
    return scheduler_service.update_job_config(db, job_key, payload.enabled, payload.intervalle_heures)


@router.post("/jobs/{job_key}/run-now", response_model=ScheduledJobOut)
def run_job_now(job_key: str, db: Session = Depends(get_db)):
    if job_key not in scheduler_service.JOBS:
        raise HTTPException(status_code=404, detail="Tâche inconnue")
    return scheduler_service.run_job_now(db, job_key)
