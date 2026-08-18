"""Fixtures partagées par toute la suite de tests backend.

- `db` : session SQLAlchemy sur une base SQLite temporaire et jetable (fichier
  distinct à chaque test, jamais la vraie `portfolio.db`), schéma posé via
  `Base.metadata.create_all`.
- `client` : `TestClient` FastAPI dont la dépendance `get_db` est basculée vers
  cette même base jetable.
- `no_network_yfinance` (autouse) : neutralise `yf.Ticker` et `yf.Search`, les
  deux seuls points d'entrée yfinance utilisés par le projet, pour qu'aucun test
  ne dépende du réseau ni de la disponibilité de Yahoo Finance.
"""

import itertools
import os
import tempfile
from datetime import datetime

import pytest
import yfinance as yf
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base, get_db
from app.main import app
from app.models import Holding, Transaction

_compteur_transaction_id = itertools.count(1)


@pytest.fixture
def db():
    fd, chemin = tempfile.mkstemp(prefix="outil_bourse_test_db_", suffix=".db")
    os.close(fd)
    engine_test = create_engine(f"sqlite:///{chemin}", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine_test)
    SessionLocalTest = sessionmaker(autocommit=False, autoflush=False, bind=engine_test)
    session = SessionLocalTest()
    try:
        yield session
    finally:
        session.close()
        engine_test.dispose()
        os.remove(chemin)


@pytest.fixture
def client(db):
    def _override_get_db():
        yield db

    app.dependency_overrides[get_db] = _override_get_db
    try:
        with TestClient(app) as test_client:
            yield test_client
    finally:
        app.dependency_overrides.pop(get_db, None)


class FauxTicker:
    """Double contrôlable pour `yf.Ticker` : par défaut aucune donnée (comme un
    identifiant non reconnu par Yahoo Finance), à surcharger au cas par cas."""

    def __init__(self, symbole, *args, **kwargs):
        self.symbole = symbole
        self.info: dict = {}
        self.funds_data = None


class FauxSearch:
    """Double contrôlable pour `yf.Search` : aucun résultat par défaut."""

    def __init__(self, *args, **kwargs):
        self.quotes: list = []


@pytest.fixture(autouse=True)
def no_network_yfinance(monkeypatch):
    monkeypatch.setattr(yf, "Ticker", FauxTicker)
    monkeypatch.setattr(yf, "Search", FauxSearch)


def make_transaction(db, **overrides) -> Transaction:
    """Construit et persiste une transaction de test avec des valeurs par défaut
    raisonnables (achat en bourse), surchargeables au cas par cas."""
    defaults = dict(
        transaction_id=f"tx-test-{next(_compteur_transaction_id)}",
        datetime_utc=datetime(2024, 1, 1),
        date="2024-01-01",
        category="TRADING",
        type="BUY",
        asset_class="STOCK",
        symbol="TEST",
        name="Titre de test",
        shares=1.0,
        price=100.0,
        amount=-100.0,
        fee=0.0,
        tax=0.0,
        description=None,
    )
    defaults.update(overrides)
    tx = Transaction(**defaults)
    db.add(tx)
    db.commit()
    db.refresh(tx)
    return tx


def make_holding(db, **overrides) -> Holding:
    """Construit et persiste une ligne de portefeuille de test."""
    defaults = dict(
        ticker="TEST",
        nom="Titre de test",
        quantite=10.0,
        prix_revient_moyen=100.0,
        type_actif="STOCK",
    )
    defaults.update(overrides)
    holding = Holding(**defaults)
    db.add(holding)
    db.commit()
    db.refresh(holding)
    return holding
