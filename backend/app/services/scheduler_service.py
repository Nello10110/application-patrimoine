"""Tâches planifiées (rafraîchissement automatique des données de marché), pilotées
par un `BackgroundScheduler` APScheduler en tâche de fond du process FastAPI (pas
d'infrastructure externe — appli locale mono-utilisateur). Configuration persistée
dans `ScheduledJobConfig`, éditable depuis l'écran Réglages (`routers/settings.py`).

Le déclenchement manuel (`run_job_now`, bouton "Lancer maintenant") est non
bloquant depuis le LOT 4B : voir la docstring de `run_job_now` pour le détail —
il réutilise l'exécuteur en tâche de fond de `market_data_service`.
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
        # Session neuve et indépendante (LOT 3.8) : si l'exception venait de `db`
        # elle-même (connexion en mauvais état, transaction déjà invalidée...), un
        # `_record_result(db, ...)` sur cette même session échouerait à son tour et
        # le statut d'échec ne serait jamais persisté — l'utilisateur ne verrait
        # jamais l'échec dans les Réglages. Une session fraîche isole complètement
        # l'écriture du statut de la cause de l'échec.
        db_statut = SessionLocal()
        try:
            _record_result(db_statut, MARKET_DATA_REFRESH, "erreur", str(exc))
        finally:
            db_statut.close()
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
    """Déclenche `job_key` sans bloquer la requête HTTP (LOT 4B).

    Le job planifié (`_run_market_data_refresh`, exécuté par APScheduler dans son
    propre fil via `init_scheduler`) reste synchrone de son point de vue : il tourne
    déjà hors du cycle requête/réponse HTTP, c'est le bon comportement. Seul le
    déclenchement *manuel* (ce point d'entrée, appelé par
    `routers/settings.run_job_now`) devait devenir non bloquant : comme pour
    `POST /api/market-data/refresh` (4.7), `_run_market_data_refresh` dépasse
    largement la minute sur le portefeuille réel de l'utilisateur.

    Le seul job connu à ce jour (`MARKET_DATA_REFRESH`) est *littéralement* un
    rafraîchissement des cours : le déclenchement manuel réutilise donc directement
    l'exécuteur partagé de `market_data_service` (même fil, même état consultable
    via `GET /api/market-data/refresh/status`) plutôt que de dupliquer toute une
    infrastructure de suivi de progression. Deux bénéfices : un seul
    rafraîchissement de cours à la fois quel que soit l'écran d'où il est déclenché
    (Portefeuille ou Réglages, `RafraichissementDejaEnCoursError` protège les deux),
    et une progression ("x / y positions") que `ScheduledJobConfig` ne peut pas
    exposer sans lui ajouter une colonne (hors périmètre de ce lot — `models.py`
    n'est pas censé changer ici). Si `JOBS` accueille un jour un job d'une autre
    nature, ce court-circuit devra être généralisé (par exemple : chaque job expose
    son propre couple `demarrer`/`etat`, sur le modèle de `market_data_service`).

    Renvoie immédiatement la config *actuelle*, pas encore mise à jour par cette
    exécution : le frontend doit re-solliciter `GET /api/settings/jobs` une fois le
    rafraîchissement terminé (`GET /api/market-data/refresh/status` ne redevient
    `en_cours=False` qu'à ce moment-là) pour voir `derniere_execution`/`dernier_statut`
    évoluer. Lève `market_data_service.RafraichissementDejaEnCoursError` si un
    rafraîchissement est déjà en cours ; dans ce cas rien n'est démarré ni modifié."""
    if job_key not in JOBS:
        raise KeyError(job_key)

    if job_key == MARKET_DATA_REFRESH:
        items = [(row[0], row[1]) for row in db.query(Holding.ticker, Holding.type_actif).distinct().all()]

        def _sur_fin(etat) -> None:
            # Session dédiée : ce callback s'exécute dans le fil de fond, bien après
            # que la session `db` du thread de requête HTTP (celle passée à cette
            # fonction) a été refermée par `get_db`.
            db_statut = SessionLocal()
            try:
                _record_result(db_statut, MARKET_DATA_REFRESH, etat.statut or "erreur", etat.message or "")
            finally:
                db_statut.close()

        market_data_service.demarrer_rafraichissement(items, on_termine=_sur_fin)
    else:  # pragma: no cover - aucun autre job à ce jour, cf. docstring ci-dessus
        JOBS[job_key]()

    return _get_or_create_config(db, job_key)
