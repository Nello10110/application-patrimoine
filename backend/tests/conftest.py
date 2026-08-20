"""Fixtures partagées par toute la suite de tests backend.

- `db` : session SQLAlchemy sur une base SQLite temporaire et jetable (fichier
  distinct à chaque test, jamais la vraie `patrimoine.db`), schéma posé via
  `Base.metadata.create_all`.
- `client` : `TestClient` FastAPI dont la dépendance `get_db` est basculée vers
  cette même base jetable, et `get_current_user` (Milestone 1, multi-utilisateur)
  vers un utilisateur de test fixe — toutes les routes exigent désormais d'être
  connecté, cf. `main.py`.
- `no_network_yfinance` (autouse) : neutralise `yf.Ticker` et `yf.Search`, les
  deux seuls points d'entrée yfinance utilisés par le projet, pour qu'aucun test
  ne dépende du réseau ni de la disponibilité de Yahoo Finance.
- `no_network_justetf` (autouse) : même principe, côté `requests.get` — seul point
  d'entrée réseau de `justetf_service` (`_fetch_page_html`/`fetch_price`, 2.4).
  Sans cette neutralisation, tout test exerçant `market_data_service.refresh_tickers`
  (ou `market_data_refresh.demarrer_rafraichissement`, cf. ci-dessous)
  ou `justetf_service.refresh_all` sur un ticker `FUND` sans monkeypatch explicite
  ferait un vrai appel réseau vers justetf.com.
- `reinitialiser_limite_rafraichissement_manuel` (autouse) : remet à zéro l'état
  mémoire du délai minimal entre rafraîchissements manuels (LOT 7.5) entre chaque
  test, pour qu'un test n'hérite pas d'un rafraîchissement déclenché par un test
  précédent dans le même process.
- `reinitialiser_rafraichissement_arriere_plan` (autouse) : attend la fin du fil de
  fond du rafraîchissement (LOT 4B, `market_data_refresh.demarrer_rafraichissement`)
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

from app.auth import get_current_user
from app.database import Base, get_db
from app.main import app
from app.models import Holding, Transaction, User
from app.services import justetf_service, market_data_refresh

_compteur_transaction_id = itertools.count(1)

# Multi-utilisateur (Milestone 2a, isolation des données) : la fixture `db` crée cet
# utilisateur comme TOUTE PREMIÈRE ligne de la base de test, fraîchement créée à
# chaque test (fichier SQLite jetable) — son id est donc déterministe (1), fixé
# explicitement ici plutôt que de compter sur l'autoincrément pour que ce ne soit
# pas un détail d'implémentation implicite. `make_holding`/`make_transaction`
# l'utilisent comme propriétaire par défaut ; les tests qui construisent une ligne
# directement (`Holding(...)`, `Transaction(...)`, `Loan(...)`, `AllocationTarget(...)`)
# doivent désormais passer `user_id=ID_UTILISATEUR_TEST` explicitement.
ID_UTILISATEUR_TEST = 1
NOM_UTILISATEUR_TEST = "test"
# Second compte, pour les tests d'isolation inter-utilisateurs (Milestone 2a,
# `tests/test_isolation_utilisateurs.py`) — créé par la fixture `client_b`, jamais
# par `db` (qui ne crée que ID_UTILISATEUR_TEST), pour ne pas fausser les ~450
# tests existants qui ne s'attendent qu'à un seul utilisateur en base.
ID_UTILISATEUR_B = 2
NOM_UTILISATEUR_B = "test-b"


@pytest.fixture
def db():
    fd, chemin = tempfile.mkstemp(prefix="patrimoine_test_db_", suffix=".db")
    os.close(fd)
    engine_test = create_engine(f"sqlite:///{chemin}", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine_test)
    SessionLocalTest = sessionmaker(autocommit=False, autoflush=False, bind=engine_test)
    session = SessionLocalTest()
    # Multi-utilisateur (Milestone 2a) : toute première ligne de la base fraîchement
    # créée, donc id déterministe — cf. ID_UTILISATEUR_TEST ci-dessus.
    session.add(User(id=ID_UTILISATEUR_TEST, username=NOM_UTILISATEUR_TEST, password_hash="inutilisé"))
    session.commit()
    try:
        yield session
    finally:
        session.close()
        engine_test.dispose()
        os.remove(chemin)


@pytest.fixture
def client(db):
    """`get_current_user` est aussi basculée (Milestone 1, multi-utilisateur) vers
    l'utilisateur de test fixe créé par la fixture `db` : la quasi-totalité de la
    suite ne teste pas l'authentification elle-même, seulement le comportement des
    routes UNE FOIS connecté — sans cet override, les ~400 tests existants
    échoueraient tous en 401. `tests/test_auth_router.py` retire volontairement cet
    override pour exercer le vrai comportement (401 sans jeton, jeton invalide/expiré)."""

    def _override_get_db():
        yield db

    utilisateur_test = db.get(User, ID_UTILISATEUR_TEST)

    app.dependency_overrides[get_db] = _override_get_db
    app.dependency_overrides[get_current_user] = lambda: utilisateur_test
    try:
        with TestClient(app) as test_client:
            yield test_client
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_user, None)


def basculer_utilisateur(db, user_id: int, username: str) -> User:
    """Repointe `get_current_user` (Milestone 2a, `test_isolation_utilisateurs.py`)
    vers un autre compte, créé au passage si besoin, sur le MÊME `client` déjà en
    place — `app.dependency_overrides` est un dict global sur l'objet `app` unique
    du process de test : deux fixtures `client` séparées s'écraseraient l'une
    l'autre plutôt que de coexister, d'où ce basculement explicite en cours de test
    plutôt qu'une seconde fixture `client_b`."""
    utilisateur = db.get(User, user_id)
    if utilisateur is None:
        utilisateur = User(id=user_id, username=username, password_hash="inutilisé")
        db.add(utilisateur)
        db.commit()
    app.dependency_overrides[get_current_user] = lambda: utilisateur
    return utilisateur


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


def _requests_get_bloque(*args, **kwargs):
    raise ConnectionError("appel réseau réel bloqué en test — cf. fixture no_network_justetf")


@pytest.fixture(autouse=True)
def no_network_justetf(monkeypatch):
    """Neutralise `requests.get` (seul point d'entrée réseau de `justetf_service`,
    cf. docstring du module) pour qu'aucun test n'appelle réellement justetf.com.
    `_fetch_page_html` et `fetch_price` absorbent déjà toute exception réseau et
    renvoient `None` — un test qui a besoin d'un scénario précis (succès, statut
    HTTP particulier, JSON inattendu...) monkeypatche `requests.get` lui-même, ce
    qui prime naturellement sur ce défaut."""
    monkeypatch.setattr(justetf_service.requests, "get", _requests_get_bloque)


@pytest.fixture(autouse=True)
def reinitialiser_limite_rafraichissement_manuel(monkeypatch):
    monkeypatch.setattr(market_data_refresh, "_dernier_rafraichissement_manuel", None)


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
    market_data_refresh._etat = market_data_refresh.EtatRafraichissement()
    market_data_refresh._thread_courant = None


def attendre_fin_rafraichissement_arriere_plan(timeout: float = 5.0) -> None:
    """Rend le fil de fond de `market_data_refresh.demarrer_rafraichissement`
    déterministe pour les tests : plutôt que de sonder l'état à intervalles réels
    (ce que fait le frontend, cf. LOT 4B), on attend simplement que le fil ait
    terminé, avec un délai maximal généreux pour ne jamais bloquer indéfiniment si
    un test est mal formé. `no_network_yfinance` garantit qu'aucun test n'appelle
    réellement Yahoo Finance, donc ce fil se termine en pratique quasi
    instantanément."""
    thread = market_data_refresh._thread_courant
    if thread is not None:
        thread.join(timeout=timeout)


def make_transaction(db, **overrides) -> Transaction:
    """Construit et persiste une transaction de test avec des valeurs par défaut
    raisonnables (achat en bourse), surchargeables au cas par cas."""
    defaults = dict(
        user_id=ID_UTILISATEUR_TEST,
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
        user_id=ID_UTILISATEUR_TEST,
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
