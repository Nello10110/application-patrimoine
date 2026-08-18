"""Tâches planifiées (rafraîchissement automatique des données de marché), pilotées
par un `BackgroundScheduler` APScheduler en tâche de fond du process FastAPI (pas
d'infrastructure externe — appli locale mono-utilisateur). Configuration persistée
dans `ScheduledJobConfig`, éditable depuis l'écran Réglages (`routers/settings.py`).
"""

import logging
from datetime import datetime, timezone
from typing import Callable

from apscheduler.schedulers.background import BackgroundScheduler
from sqlalchemy.orm import Session

from ..database import SessionLocal
from ..models import Holding, ScheduledJobConfig
from . import market_data_service

logger = logging.getLogger("outil_bourse.scheduler")

MARKET_DATA_REFRESH = "market_data_refresh"


def _run_market_data_refresh() -> None:
    """Rafraîchit prix + composition + top holdings de toutes les positions (un
    seul appel car `market_data_service.refresh_tickers` fait déjà les trois).
    Ne laisse jamais une exception remonter : un échec ne doit pas arrêter le
    scheduler ni empêcher la prochaine exécution planifiée."""
    db = SessionLocal()
    try:
        items = [(row[0], row[1]) for row in db.query(Holding.ticker, Holding.type_actif).distinct().all()]
        market_data_service.refresh_tickers(db, items)
        _record_result(db, MARKET_DATA_REFRESH, "ok", f"{len(items)} position(s) rafraîchie(s)")
    except Exception as exc:
        db.rollback()
        logger.exception("échec du rafraîchissement planifié")
        _record_result(db, MARKET_DATA_REFRESH, "erreur", str(exc))
    finally:
        db.close()


JOBS: dict[str, Callable[[], None]] = {MARKET_DATA_REFRESH: _run_market_data_refresh}

_scheduler: BackgroundScheduler | None = None


def _get_or_create_config(db: Session, job_key: str) -> ScheduledJobConfig:
    config = db.get(ScheduledJobConfig, job_key)
    if config is None:
        config = ScheduledJobConfig(job_key=job_key)
        db.add(config)
        db.commit()
        db.refresh(config)
    return config


def _record_result(db: Session, job_key: str, statut: str, message: str) -> None:
    config = _get_or_create_config(db, job_key)
    config.derniere_execution = datetime.now(timezone.utc)
    config.dernier_statut = statut
    config.dernier_message = message
    db.commit()


def init_scheduler() -> None:
    """À appeler au démarrage de l'app : charge (ou crée) la config de chaque job
    connu et programme son exécution périodique si activé."""
    global _scheduler
    _scheduler = BackgroundScheduler(timezone="UTC")
    db = SessionLocal()
    try:
        for job_key, func in JOBS.items():
            config = _get_or_create_config(db, job_key)
            if config.enabled:
                _scheduler.add_job(func, "interval", hours=config.intervalle_heures, id=job_key)
    finally:
        db.close()
    _scheduler.start()
    logger.info("scheduler démarré")


def shutdown_scheduler() -> None:
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)


def list_jobs(db: Session) -> list[ScheduledJobConfig]:
    for job_key in JOBS:
        _get_or_create_config(db, job_key)
    return db.query(ScheduledJobConfig).order_by(ScheduledJobConfig.job_key).all()


def update_job_config(db: Session, job_key: str, enabled: bool, intervalle_heures: float) -> ScheduledJobConfig:
    """Met à jour la config en base et reprogramme le job vivant (retire puis
    rajoute le trigger APScheduler avec le nouvel intervalle)."""
    config = _get_or_create_config(db, job_key)
    config.enabled = enabled
    config.intervalle_heures = intervalle_heures
    db.commit()
    db.refresh(config)

    if _scheduler is not None and job_key in JOBS:
        if _scheduler.get_job(job_key):
            _scheduler.remove_job(job_key)
        if enabled:
            _scheduler.add_job(JOBS[job_key], "interval", hours=intervalle_heures, id=job_key)

    return config


def run_job_now(db: Session, job_key: str) -> ScheduledJobConfig:
    func = JOBS.get(job_key)
    if func is None:
        raise KeyError(job_key)
    func()
    return _get_or_create_config(db, job_key)
