"""Fixtures partagées par toute la suite de tests backend.

- `db` : session SQLAlchemy sur une base SQLite temporaire et jetable (fichier
  distinct à chaque test, jamais la vraie `portfolio.db`), schéma posé via
  `Base.metadata.create_all`.
- `client` : `TestClient` FastAPI dont la dépendance `get_db` est basculée vers
  cette même base jetable.
- `no_network_yfinance` (autouse) : neutralise `yf.Ticker` et `yf.Search`, les
  deux seuls points d'entrée yfinance utilisés par le projet, pour qu'aucun test
  ne dépende du réseau ni de la disponibilité de Yahoo Finance.
- `reinitialiser_limite_rafraichissement_manuel` (autouse) : remet à zéro l'état
  mémoire du délai minimal entre rafraîchissements manuels (LOT 7.5) entre chaque
  test, pour qu'un test n'hérite pas d'un rafraîchissement déclenché par un test
  précédent dans le même process.
- `reinitialiser_rafraichissement_arriere_plan` (autouse) : attend la fin du fil de
  fond du rafraîchissement (LOT 4B, `market_data_service.demarrer_rafraichissement`)
  et remet à zéro son état module-level entre chaque test. `attendre_fin_rafraichissement_arriere_plan`
  (fonction, pas fixture) rend ce fil déterministe dans les tests qui veulent
  observer son état final sans sonder à intervalles réels.
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
from app.services import market_data_service

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


@pytest.fixture(autouse=True)
def reinitialiser_limite_rafraichissement_manuel(monkeypatch):
    monkeypatch.setattr(market_data_service, "_dernier_rafraichissement_manuel", None)


@pytest.fixture(autouse=True)
def reinitialiser_rafraichissement_arriere_plan():
    """Isole l'état module-level du rafraîchissement en tâche de fond (LOT 4B)
    entre deux tests : sans ça, un `en_cours=True` laissé par un test précédent
    ferait échouer le suivant en 409, et un fil encore vivant pourrait continuer à
    écrire dans la base partagée par les tests après la fin du test qui l'a lancé.
    Attend la fin du fil éventuellement laissé vivant (délai maximal court : aucun
    test de cette suite ne simule un vrai appel réseau, donc rien ne devrait jamais
    tourner plus de quelques millisecondes) avant de remettre l'état à zéro."""
    yield
    attendre_fin_rafraichissement_arriere_plan()
    market_data_service._etat = market_data_service.EtatRafraichissement()
    market_data_service._thread_courant = None


def attendre_fin_rafraichissement_arriere_plan(timeout: float = 5.0) -> None:
    """Rend le fil de fond de `market_data_service.demarrer_rafraichissement`
    déterministe pour les tests : plutôt que de sonder l'état à intervalles réels
    (ce que fait le frontend, cf. LOT 4B), on attend simplement que le fil ait
    terminé, avec un délai maximal généreux pour ne jamais bloquer indéfiniment si
    un test est mal formé. `no_network_yfinance` garantit qu'aucun test n'appelle
    réellement Yahoo Finance, donc ce fil se termine en pratique quasi
    instantanément."""
    thread = market_data_service._thread_courant
    if thread is not None:
        thread.join(timeout=timeout)


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
