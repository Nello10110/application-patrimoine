"""Tâches planifiées (rafraîchissement automatique des données de marché), pilotées
par un `BackgroundScheduler` APScheduler en tâche de fond du process FastAPI (pas
d'infrastructure externe — appli locale mono-utilisateur). Configuration persistée
dans `ScheduledJobConfig`, éditable depuis l'écran Réglages (`routers/settings.py`).

Le déclenchement manuel (`run_job_now`, bouton "Lancer maintenant") est non
bloquant depuis le LOT 4B : voir la docstring de `run_job_now` pour le détail —
il réutilise l'exécuteur en tâche de fond de `market_data_refresh`.
"""

import logging
from collections.abc import Callable
from datetime import UTC, datetime

from apscheduler.schedulers.background import BackgroundScheduler
from sqlalchemy.orm import Session

from scripts import sauvegarde as sauvegarde_module

from ..database import SessionLocal
from ..models import Holding, ScheduledJobConfig
from . import backup_service, justetf_service, market_data_refresh, market_data_service

logger = logging.getLogger("patrimoine.scheduler")

MARKET_DATA_REFRESH = "market_data_refresh"
JUSTETF_REFRESH = "justetf_refresh"
BACKUP_ENCRYPTED = "sauvegarde_chiffree"

# Intervalle par défaut (heures) appliqué à la création de la config d'un job, à la
# place du `24.0` du modèle `ScheduledJobConfig` (correct pour MARKET_DATA_REFRESH,
# mais trop fréquent pour justETF — cf. `_run_justetf_refresh`) : composition d'un
# ETF qui change lentement, et politesse envers une ressource sans SLA ni support
# recommandent d'y aller doucement (hebdomadaire par défaut, ajustable ensuite
# depuis Réglages comme n'importe quel job).
DEFAULTS: dict[str, float] = {JUSTETF_REFRESH: 168.0, BACKUP_ENCRYPTED: 24.0}


def _run_market_data_refresh() -> None:
    """Rafraîchit prix + composition + top holdings de toutes les positions (un
    seul appel car `market_data_service.refresh_tickers` fait déjà les trois).
    Ne laisse jamais une exception remonter : un échec ne doit pas arrêter le
    scheduler ni empêcher la prochaine exécution planifiée."""
    db = SessionLocal()
    try:
        # Intentionnellement NON filtré par utilisateur (Milestone 2a, cf.
        # docs/BACKLOG.md § 2.I.1) : le cache de marché reste global, partagé par
        # tous les comptes — ce job doit couvrir les tickers de tout le monde.
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


def _run_justetf_refresh() -> None:
    """Rafraîchit la composition pays/secteurs des ETF via justETF (2.4). Même
    structure que `_run_market_data_refresh` (session dédiée pour `_record_result`
    en cas d'échec — voir sa docstring pour le pourquoi) : ne laisse jamais une
    exception remonter, bien que `justetf_service.refresh_all` ne soit de toute
    façon pas censé en lever (chaque ISIN est traité défensivement)."""
    db = SessionLocal()
    try:
        resume = justetf_service.refresh_all(db)
        _record_result(
            db, JUSTETF_REFRESH, "ok", f"{resume['reussis']}/{resume['traites']} ETF mis à jour"
        )
    except Exception as exc:
        db.rollback()
        logger.exception("échec du rafraîchissement justETF planifié")
        db_statut = SessionLocal()
        try:
            _record_result(db_statut, JUSTETF_REFRESH, "erreur", str(exc))
        finally:
            db_statut.close()
    finally:
        db.close()


def _run_sauvegarde_chiffree() -> None:
    """Sauvegarde + chiffrement planifiés (backlog 2.L.2), même structure que
    `_run_justetf_refresh`. `backup_service.CleChiffrementAbsenteError` (clé
    `PATRIMOINE_BACKUP_KEY` non définie) est incluse dans les erreurs jamais
    remontées : le scheduler et les autres jobs continuent de tourner même sans
    clé configurée, le job apparaît simplement en statut "erreur" dans Réglages."""
    db = SessionLocal()
    try:
        chemin = backup_service.sauvegarder_chiffre(
            sauvegarde_module.chemin_base_source(), sauvegarde_module.DOSSIER_SAUVEGARDES_PAR_DEFAUT
        )
        supprimees = backup_service.appliquer_retention_chiffree(
            sauvegarde_module.DOSSIER_SAUVEGARDES_PAR_DEFAUT, sauvegarde_module.RETENTION_PAR_DEFAUT
        )
        message = chemin.name
        if supprimees:
            message += f" ({len(supprimees)} ancienne(s) supprimée(s))"
        _record_result(db, BACKUP_ENCRYPTED, "ok", message)
    except Exception as exc:
        db.rollback()
        logger.exception("échec de la sauvegarde chiffrée planifiée")
        db_statut = SessionLocal()
        try:
            _record_result(db_statut, BACKUP_ENCRYPTED, "erreur", str(exc))
        finally:
            db_statut.close()
    finally:
        db.close()


JOBS: dict[str, Callable[[], None]] = {
    MARKET_DATA_REFRESH: _run_market_data_refresh,
    JUSTETF_REFRESH: _run_justetf_refresh,
    BACKUP_ENCRYPTED: _run_sauvegarde_chiffree,
}

_scheduler: BackgroundScheduler | None = None


def _get_or_create_config(db: Session, job_key: str) -> ScheduledJobConfig:
    config = db.get(ScheduledJobConfig, job_key)
    if config is None:
        if job_key in DEFAULTS:
            config = ScheduledJobConfig(job_key=job_key, intervalle_heures=DEFAULTS[job_key])
        else:
            config = ScheduledJobConfig(job_key=job_key)
        db.add(config)
        db.commit()
        db.refresh(config)
    return config


def _record_result(db: Session, job_key: str, statut: str, message: str) -> None:
    config = _get_or_create_config(db, job_key)
    config.derniere_execution = datetime.now(UTC)
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

    `MARKET_DATA_REFRESH` est *littéralement* un rafraîchissement des cours : son
    déclenchement manuel réutilise donc directement l'exécuteur partagé de
    `market_data_refresh` (même fil, même état consultable via
    `GET /api/market-data/refresh/status`) plutôt que de dupliquer toute une
    infrastructure de suivi de progression. Deux bénéfices : un seul
    rafraîchissement de cours à la fois quel que soit l'écran d'où il est déclenché
    (Portefeuille ou Réglages, `RafraichissementDejaEnCoursError` protège les deux),
    et une progression ("x / y positions") que `ScheduledJobConfig` ne peut pas
    exposer sans lui ajouter une colonne (hors périmètre de ce lot — `models.py`
    n'est pas censé changer ici).

    `JUSTETF_REFRESH` (2.4) est le premier job d'une autre nature anticipé par le
    paragraphe précédent dans une version antérieure de cette docstring : il ne
    dépasse pas la minute (une trentaine d'ISIN au plus, throttlés bien moins
    agressivement que Yahoo Finance) et n'a pas besoin d'un état de progression
    consultable — il tombe donc simplement dans la branche générique `else`
    ci-dessous, qui appelle `JOBS[job_key]()` de façon synchrone. Un futur job plus
    long qu'`JUSTETF_REFRESH` mais qui ne serait pas non plus `MARKET_DATA_REFRESH`
    justifierait alors de généraliser le court-circuit (par exemple : chaque job
    expose son propre couple `demarrer`/`etat`, sur le modèle de
    `market_data_refresh`).

    Renvoie immédiatement la config *actuelle*, pas encore mise à jour par cette
    exécution : le frontend doit re-solliciter `GET /api/settings/jobs` une fois le
    rafraîchissement terminé (`GET /api/market-data/refresh/status` ne redevient
    `en_cours=False` qu'à ce moment-là) pour voir `derniere_execution`/`dernier_statut`
    évoluer. Lève `market_data_refresh.RafraichissementDejaEnCoursError` si un
    rafraîchissement est déjà en cours ; dans ce cas rien n'est démarré ni modifié."""
    if job_key not in JOBS:
        raise KeyError(job_key)

    if job_key == MARKET_DATA_REFRESH:
        # Intentionnellement NON filtré par utilisateur (Milestone 2a, cf.
        # docs/BACKLOG.md § 2.I.1) : le cache de marché reste global, partagé par
        # tous les comptes — ce job doit couvrir les tickers de tout le monde.
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

        market_data_refresh.demarrer_rafraichissement(items, on_termine=_sur_fin)
    else:  # branche générique (ex. JUSTETF_REFRESH), cf. docstring ci-dessus
        JOBS[job_key]()

    return _get_or_create_config(db, job_key)
