"""Verrouille le rafraîchissement des cours en tâche de fond (LOT 4B) :
`market_data_refresh.demarrer_rafraichissement`/`etat_rafraichissement`.

Comme `test_scheduler_service.py`, ce module lit/écrit directement via
`app.database.SessionLocal` (la base de test partagée par tout le process, cf.
`backend/conftest.py`) plutôt que via les fixtures `db`/`client` : c'est aussi la
session qu'ouvre le fil de fond du rafraîchissement (`SessionLocal` importée dans
`market_data_refresh`), qui n'a aucun moyen de connaître la base jetable propre à
un test HTTP particulier.

Déterminisme du fil de fond : la fixture autouse `reinitialiser_rafraichissement_arriere_plan`
(`tests/conftest.py`) attend la fin du fil (`_thread_courant.join`) à la fin de
chaque test. Les tests qui ont besoin d'observer un état "en cours" avant la fin du
travail bloquent volontairement `refresh_tickers` (monkeypatché) sur un
`threading.Event` que le test contrôle, plutôt que de sonder l'API à intervalles
réels — aucun `time.sleep` n'est nécessaire nulle part ici."""

import threading

import pytest

from app.database import SessionLocal
from app.models import FundComposition, HistoriqueCache, MarketDataCache, TickerResolution
from app.services import historique_cache, market_data_refresh, market_data_service

from .conftest import attendre_fin_rafraichissement_arriere_plan


def _nettoyer_base_partagee():
    db = SessionLocal()
    try:
        db.query(MarketDataCache).delete()
        db.query(TickerResolution).delete()
        db.query(FundComposition).delete()
        db.query(HistoriqueCache).delete()
        db.commit()
    finally:
        db.close()


@pytest.fixture(autouse=True)
def _base_partagee_isolee():
    _nettoyer_base_partagee()
    yield
    _nettoyer_base_partagee()


def test_demarrer_rafraichissement_renvoie_immediatement_letat_de_depart():
    etat = market_data_refresh.demarrer_rafraichissement([("AAA", "STOCK"), ("BBB", "STOCK")])

    assert etat.en_cours is True
    assert etat.positions_total == 2
    assert etat.positions_traitees == 0
    assert etat.demarre_le is not None


def test_second_demarrage_immediat_refuse_tant_que_le_premier_tourne(monkeypatch):
    """Verrou central du LOT 4B : deux rafraîchissements ne doivent jamais tourner
    en même temps. Bloque volontairement le premier sur un événement pour garantir
    (sans aucun sleep réel) que le second est bien tenté pendant que le premier est
    encore en cours."""
    demarre = threading.Event()
    liberer = threading.Event()

    def refresh_tickers_bloquant(db, items, on_progression=None):
        demarre.set()
        assert liberer.wait(timeout=5), "le test n'a pas libéré le fil à temps"
        return []

    monkeypatch.setattr(market_data_service, "refresh_tickers", refresh_tickers_bloquant)

    market_data_refresh.demarrer_rafraichissement([("AAA", "STOCK")])
    assert demarre.wait(timeout=5), "le fil de fond n'a pas démarré à temps"

    with pytest.raises(market_data_refresh.RafraichissementDejaEnCoursError):
        market_data_refresh.demarrer_rafraichissement([("BBB", "STOCK")])

    liberer.set()
    attendre_fin_rafraichissement_arriere_plan()
    assert market_data_refresh.etat_rafraichissement().en_cours is False


def test_progression_reportee_au_fil_du_rafraichissement(monkeypatch):
    """Vérifie que `on_progression` (passé par `demarrer_rafraichissement` à
    `refresh_tickers`) est bien répercuté dans l'état consultable pendant
    l'exécution, pas seulement une fois le travail terminé."""
    etape_vue = threading.Event()
    continuer = threading.Event()

    def refresh_tickers_pas_a_pas(db, items, on_progression=None):
        on_progression(1, len(items))
        etape_vue.set()
        assert continuer.wait(timeout=5), "le test n'a pas laissé la deuxième étape se jouer à temps"
        on_progression(2, len(items))
        return []

    monkeypatch.setattr(market_data_service, "refresh_tickers", refresh_tickers_pas_a_pas)

    market_data_refresh.demarrer_rafraichissement([("AAA", "STOCK"), ("BBB", "STOCK")])
    assert etape_vue.wait(timeout=5)

    etat_intermediaire = market_data_refresh.etat_rafraichissement()
    assert etat_intermediaire.en_cours is True
    assert etat_intermediaire.positions_traitees == 1
    assert etat_intermediaire.positions_total == 2

    continuer.set()
    attendre_fin_rafraichissement_arriere_plan()

    etat_final = market_data_refresh.etat_rafraichissement()
    assert etat_final.en_cours is False
    assert etat_final.positions_traitees == 2
    assert etat_final.statut == "ok"


def test_erreur_dans_le_fil_reflechie_en_statut_erreur_sans_faire_planter_le_process(monkeypatch):
    def refresh_tickers_defaillant(db, items, on_progression=None):
        raise RuntimeError("panne simulée du rafraîchissement en tâche de fond")

    monkeypatch.setattr(market_data_service, "refresh_tickers", refresh_tickers_defaillant)

    # Ne doit lever aucune exception ici : `demarrer_rafraichissement` ne fait que
    # lancer le fil, l'exception se produit *dans* le fil et y reste capturée.
    market_data_refresh.demarrer_rafraichissement([("AAA", "STOCK")])
    attendre_fin_rafraichissement_arriere_plan()

    etat = market_data_refresh.etat_rafraichissement()
    assert etat.en_cours is False
    assert etat.statut == "erreur"
    assert "panne simulée" in etat.message


def test_rafraichissement_reussi_invalide_le_cache_dhistorique_du_portefeuille(monkeypatch):
    """Sans cette invalidation, le graphique d'évolution du tableau de bord
    resterait figé jusqu'à 24h après une mise à jour des cours (LOT 4.5 vs LOT 4B).
    Rafraîchissement global (Milestone 2a) : le cache de CHAQUE utilisateur doit
    être invalidé, pas seulement celui de qui l'a déclenché."""
    cle = historique_cache.cle_historique_portefeuille(1)
    cle_autre_utilisateur = historique_cache.cle_historique_portefeuille(2)
    db = SessionLocal()
    try:
        historique_cache.ecrire(db, cle, [{"date": "2024-01-01", "valeur_portefeuille": 100.0, "valeur_investie": 100.0}])
        historique_cache.ecrire(db, cle_autre_utilisateur, [{"date": "2024-01-01", "valeur_portefeuille": 50.0, "valeur_investie": 50.0}])
        assert historique_cache.lire(db, cle) is not None
        assert historique_cache.lire(db, cle_autre_utilisateur) is not None
    finally:
        db.close()

    monkeypatch.setattr(market_data_service, "refresh_tickers", lambda db, items, on_progression=None: [])

    market_data_refresh.demarrer_rafraichissement([("AAA", "STOCK")])
    attendre_fin_rafraichissement_arriere_plan()

    db = SessionLocal()
    try:
        assert historique_cache.lire(db, cle) is None
        assert historique_cache.lire(db, cle_autre_utilisateur) is None
    finally:
        db.close()


def test_connexion_configuree_en_wal_avec_busy_timeout_genereux():
    """Verrouille le correctif § T.2 (retour utilisateur 30/08/2026, « Rafraîchir
    les cours » échouait par intermittence en `database is locked`) : sans mode WAL
    ni `busy_timeout` généreux, une écriture concurrente pendant qu'une transaction
    reste ouverte échoue immédiatement plutôt que d'attendre — exactement ce que
    faisait un rafraîchissement des cours qui ne committait qu'une fois tout le
    portefeuille traité (`market_data_service.refresh_tickers`, désormais corrigé en
    plus par un commit par ticker).

    Vérifie la configuration RÉELLEMENT appliquée à la connexion (`app.database`),
    plutôt qu'une course contre la montre entre deux fils : le réglage par défaut de
    `sqlite3` (`timeout=5.0`) masquerait de toute façon une régression sur un test
    qui ne tiendrait le verrou que quelques centaines de millisecondes — seule une
    contention de plusieurs secondes reproduit fidèlement le bug réel (portefeuille
    de ~50 positions, rafraîchissement qui « dépasse largement la minute »)."""
    from app.database import engine

    with engine.connect() as connexion:
        mode_journal = connexion.exec_driver_sql("PRAGMA journal_mode").scalar()
        busy_timeout_ms = connexion.exec_driver_sql("PRAGMA busy_timeout").scalar()

    assert mode_journal == "wal"
    assert busy_timeout_ms >= 30_000


def test_route_refresh_202_puis_status_puis_409_si_deja_en_cours(client, db, monkeypatch):
    """Bout en bout via les routes HTTP : `POST /refresh` (202), `GET /refresh/status`,
    puis un second `POST` immédiat refusé en 409 tant que le premier tourne encore."""
    from .conftest import make_holding

    make_holding(db, ticker="AAA", quantite=1.0)

    # Ce test cible spécifiquement le garde-fou "déjà en cours" (409), pas celui de
    # fréquence (429, déjà couvert par `test_market_data_service.py`) : sans ce
    # contournement, le second `POST` immédiat tomberait sur le 429 en premier.
    monkeypatch.setattr(market_data_refresh, "verifier_et_enregistrer_rafraichissement_manuel", lambda: None)

    demarre = threading.Event()
    liberer = threading.Event()

    def refresh_tickers_bloquant(db, items, on_progression=None):
        demarre.set()
        assert liberer.wait(timeout=5)
        return []

    monkeypatch.setattr(market_data_service, "refresh_tickers", refresh_tickers_bloquant)

    reponse = client.post("/api/market-data/refresh")
    assert reponse.status_code == 202
    assert reponse.json()["en_cours"] is True

    assert demarre.wait(timeout=5)

    statut = client.get("/api/market-data/refresh/status")
    assert statut.status_code == 200
    assert statut.json()["en_cours"] is True

    second = client.post("/api/market-data/refresh")
    assert second.status_code == 409

    liberer.set()
    attendre_fin_rafraichissement_arriere_plan()
