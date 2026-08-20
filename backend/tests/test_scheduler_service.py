"""Verrouille l'enregistrement du statut d'un rafraîchissement planifié en échec
(LOT 3.8) : avant ce lot, `_record_result` était appelé après `db.rollback()` sur
la même session que celle qui avait servi au rafraîchissement — si l'erreur
provenait de la session elle-même, l'enregistrement du statut échouait à son tour
et l'utilisateur ne voyait jamais l'échec dans les Réglages. La correction utilise
une session neuve et indépendante pour cet enregistrement.

`_run_market_data_refresh` utilise directement `app.database.SessionLocal`, pas la
base jetable par test des fixtures `db`/`client` (qui pointent vers un fichier
SQLite différent) : ce module lit donc et écrit directement via `SessionLocal`,
en nettoyant la ligne de config avant/après chaque test pour rester indépendant de
l'ordre d'exécution."""

import threading

import pytest

from app.database import SessionLocal
from app.models import ScheduledJobConfig
from app.services import justetf_service, market_data_refresh, market_data_service, scheduler_service

from .conftest import attendre_fin_rafraichissement_arriere_plan, make_holding


def _supprimer_config_job():
    db = SessionLocal()
    try:
        db.query(ScheduledJobConfig).filter(
            ScheduledJobConfig.job_key.in_([scheduler_service.MARKET_DATA_REFRESH, scheduler_service.JUSTETF_REFRESH])
        ).delete(synchronize_session=False)
        db.commit()
    finally:
        db.close()


@pytest.fixture(autouse=True)
def _config_job_isolee():
    _supprimer_config_job()
    yield
    _supprimer_config_job()


def _lire_config_job(job_key: str = scheduler_service.MARKET_DATA_REFRESH) -> ScheduledJobConfig | None:
    db = SessionLocal()
    try:
        return db.get(ScheduledJobConfig, job_key)
    finally:
        db.close()


def test_echec_refresh_tickers_persiste_le_statut_erreur(monkeypatch):
    def refresh_tickers_defaillant(db, items):
        raise RuntimeError("panne simulée du rafraîchissement")

    monkeypatch.setattr(market_data_service, "refresh_tickers", refresh_tickers_defaillant)

    scheduler_service._run_market_data_refresh()

    config = _lire_config_job()
    assert config is not None
    assert config.dernier_statut == "erreur"
    assert "panne simulée" in config.dernier_message


def test_cas_nominal_persiste_le_statut_ok(monkeypatch):
    monkeypatch.setattr(market_data_service, "refresh_tickers", lambda db, items: [])

    scheduler_service._run_market_data_refresh()

    config = _lire_config_job()
    assert config is not None
    assert config.dernier_statut == "ok"


def test_echec_utilise_une_session_dediee_pour_enregistrer_le_statut(monkeypatch):
    """Verrouille le mécanisme de la correction, pas seulement son résultat : en cas
    d'échec, une session `SessionLocal()` supplémentaire (indépendante de celle du
    rafraîchissement) doit être ouverte pour l'enregistrement du statut."""
    sessions_creees = []
    session_local_originale = scheduler_service.SessionLocal

    def session_local_espionnee():
        session = session_local_originale()
        sessions_creees.append(session)
        return session

    monkeypatch.setattr(scheduler_service, "SessionLocal", session_local_espionnee)
    monkeypatch.setattr(
        market_data_service, "refresh_tickers", lambda db, items: (_ for _ in ()).throw(RuntimeError("panne simulée"))
    )

    scheduler_service._run_market_data_refresh()

    assert len(sessions_creees) == 2  # session du rafraîchissement + session dédiée au statut d'échec
    assert sessions_creees[0] is not sessions_creees[1]


# ---------------------------------------------------------------------------
# LOT 4B — `run_job_now` (déclenchement manuel) ne bloque plus la requête
# ---------------------------------------------------------------------------


def test_run_job_now_ne_bloque_pas_et_renvoie_la_config_actuelle(db, monkeypatch):
    """`run_job_now` doit rendre la main avant que le travail ne soit terminé : on
    le bloque volontairement sur un événement pour le prouver, sans aucun sleep."""
    make_holding(db, ticker="AAA", quantite=1.0)

    demarre = threading.Event()
    liberer = threading.Event()

    def refresh_tickers_bloquant(db, items, on_progression=None):
        demarre.set()
        assert liberer.wait(timeout=5)
        return []

    monkeypatch.setattr(market_data_service, "refresh_tickers", refresh_tickers_bloquant)

    config = scheduler_service.run_job_now(db, scheduler_service.MARKET_DATA_REFRESH)

    assert config.job_key == scheduler_service.MARKET_DATA_REFRESH
    assert demarre.wait(timeout=5), "le fil de fond n'a pas démarré à temps"
    # Toujours en cours au moment où `run_job_now` a déjà rendu la main : preuve que
    # l'appel n'a pas attendu la fin du travail.
    assert market_data_refresh.etat_rafraichissement().en_cours is True

    liberer.set()
    attendre_fin_rafraichissement_arriere_plan()


def test_run_job_now_repercute_le_resultat_dans_scheduled_job_config(db, monkeypatch):
    """Une fois le rafraîchissement terminé, le statut doit apparaître dans
    `ScheduledJobConfig` (lu par la page Réglages via `GET /api/settings/jobs`),
    exactement comme pour le job planifié."""
    make_holding(db, ticker="AAA", quantite=1.0)
    monkeypatch.setattr(market_data_service, "refresh_tickers", lambda db, items, on_progression=None: [])

    scheduler_service.run_job_now(db, scheduler_service.MARKET_DATA_REFRESH)
    attendre_fin_rafraichissement_arriere_plan()

    config = _lire_config_job()
    assert config is not None
    assert config.dernier_statut == "ok"


def test_run_job_now_refuse_si_un_rafraichissement_est_deja_en_cours(db, monkeypatch):
    make_holding(db, ticker="AAA", quantite=1.0)

    demarre = threading.Event()
    liberer = threading.Event()

    def refresh_tickers_bloquant(db, items, on_progression=None):
        demarre.set()
        assert liberer.wait(timeout=5)
        return []

    monkeypatch.setattr(market_data_service, "refresh_tickers", refresh_tickers_bloquant)

    scheduler_service.run_job_now(db, scheduler_service.MARKET_DATA_REFRESH)
    assert demarre.wait(timeout=5)

    with pytest.raises(market_data_refresh.RafraichissementDejaEnCoursError):
        scheduler_service.run_job_now(db, scheduler_service.MARKET_DATA_REFRESH)

    liberer.set()
    attendre_fin_rafraichissement_arriere_plan()


def test_route_run_now_202_puis_409_si_deja_en_cours(client, db, monkeypatch):
    make_holding(db, ticker="AAA", quantite=1.0)

    demarre = threading.Event()
    liberer = threading.Event()

    def refresh_tickers_bloquant(db, items, on_progression=None):
        demarre.set()
        assert liberer.wait(timeout=5)
        return []

    monkeypatch.setattr(market_data_service, "refresh_tickers", refresh_tickers_bloquant)

    premier = client.post(f"/api/settings/jobs/{scheduler_service.MARKET_DATA_REFRESH}/run-now")
    assert premier.status_code == 202
    assert demarre.wait(timeout=5)

    second = client.post(f"/api/settings/jobs/{scheduler_service.MARKET_DATA_REFRESH}/run-now")
    assert second.status_code == 409

    liberer.set()
    attendre_fin_rafraichissement_arriere_plan()


# ---------------------------------------------------------------------------
# 2.4 — job justETF : présent dans JOBS, intervalle par défaut hebdomadaire,
# activable/désactivable/déclenchable comme n'importe quel job existant.
# ---------------------------------------------------------------------------


def test_justetf_refresh_present_dans_jobs():
    assert scheduler_service.JUSTETF_REFRESH in scheduler_service.JOBS


def test_justetf_refresh_config_par_defaut_hebdomadaire(db):
    """`DEFAULTS` doit s'appliquer à la création de la config, à la place du
    `24.0` du modèle (correct pour MARKET_DATA_REFRESH, pas pour justETF)."""
    config = scheduler_service._get_or_create_config(db, scheduler_service.JUSTETF_REFRESH)
    assert config.intervalle_heures == 168.0


def test_market_data_refresh_config_par_defaut_reste_24h(db):
    """Non-régression : l'ajout de `DEFAULTS` ne doit pas changer le comportement
    existant pour le job déjà en place."""
    config = scheduler_service._get_or_create_config(db, scheduler_service.MARKET_DATA_REFRESH)
    assert config.intervalle_heures == 24.0


def test_list_jobs_inclut_justetf_refresh(db):
    jobs = scheduler_service.list_jobs(db)
    job_keys = {job.job_key for job in jobs}
    assert scheduler_service.JUSTETF_REFRESH in job_keys


def test_update_job_config_active_desactive_justetf_refresh(db):
    config = scheduler_service.update_job_config(db, scheduler_service.JUSTETF_REFRESH, enabled=False, intervalle_heures=72.0)
    assert config.enabled is False
    assert config.intervalle_heures == 72.0

    config = scheduler_service.update_job_config(db, scheduler_service.JUSTETF_REFRESH, enabled=True, intervalle_heures=168.0)
    assert config.enabled is True
    assert config.intervalle_heures == 168.0


def test_run_job_now_justetf_refresh_synchrone_via_la_branche_generique(db, monkeypatch):
    """`JUSTETF_REFRESH` n'est pas `MARKET_DATA_REFRESH` : `run_job_now` doit donc
    l'exécuter via la branche générique (`JOBS[job_key]()`, synchrone), pas via
    l'exécuteur en tâche de fond de `market_data_service`."""
    appels = []
    monkeypatch.setattr(justetf_service, "refresh_all", lambda db: appels.append(1) or {"traites": 0, "reussis": 0})

    config = scheduler_service.run_job_now(db, scheduler_service.JUSTETF_REFRESH)

    assert appels == [1]  # exécuté de façon synchrone, pas dans un fil de fond
    assert config.job_key == scheduler_service.JUSTETF_REFRESH


def test_run_job_now_route_http_justetf_refresh(client, db, monkeypatch):
    monkeypatch.setattr(justetf_service, "refresh_all", lambda db: {"traites": 0, "reussis": 0})

    reponse = client.post(f"/api/settings/jobs/{scheduler_service.JUSTETF_REFRESH}/run-now")

    assert reponse.status_code == 202
    assert reponse.json()["job_key"] == scheduler_service.JUSTETF_REFRESH


def test_run_justetf_refresh_persiste_le_statut_ok(monkeypatch):
    monkeypatch.setattr(justetf_service, "refresh_all", lambda db: {"traites": 3, "reussis": 2})

    scheduler_service._run_justetf_refresh()

    config = _lire_config_job(scheduler_service.JUSTETF_REFRESH)
    assert config is not None
    assert config.dernier_statut == "ok"
    assert config.dernier_message == "2/3 ETF mis à jour"


def test_run_justetf_refresh_persiste_le_statut_erreur(monkeypatch):
    def refresh_all_defaillant(db):
        raise RuntimeError("panne simulée justETF")

    monkeypatch.setattr(justetf_service, "refresh_all", refresh_all_defaillant)

    scheduler_service._run_justetf_refresh()

    config = _lire_config_job(scheduler_service.JUSTETF_REFRESH)
    assert config is not None
    assert config.dernier_statut == "erreur"
    assert "panne simulée justETF" in config.dernier_message
