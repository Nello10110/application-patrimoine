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

import pytest

from app.database import SessionLocal
from app.models import ScheduledJobConfig
from app.services import market_data_service, scheduler_service


def _supprimer_config_job():
    db = SessionLocal()
    try:
        db.query(ScheduledJobConfig).filter(ScheduledJobConfig.job_key == scheduler_service.MARKET_DATA_REFRESH).delete()
        db.commit()
    finally:
        db.close()


@pytest.fixture(autouse=True)
def _config_job_isolee():
    _supprimer_config_job()
    yield
    _supprimer_config_job()


def _lire_config_job() -> ScheduledJobConfig | None:
    db = SessionLocal()
    try:
        return db.get(ScheduledJobConfig, scheduler_service.MARKET_DATA_REFRESH)
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
