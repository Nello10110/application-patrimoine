"""Connexion SQLite + migrations de schéma au démarrage.

Les migrations passent par Alembic (backlog 2.I.4) — `upgrade_schema()` ci-dessous
appelle `alembic upgrade head`, qui crée ou met à jour le schéma jusqu'à la révision
la plus récente (`backend/alembic/versions/`), aussi bien sur une base neuve que sur
une base existante. Les anciennes fonctions maison (`run_startup_migrations` et les
migrations de contenu one-off) ont été retirées : elles ne savaient qu'ajouter des
colonnes nullable (jamais renommer/retyper une colonne ni changer une contrainte),
ce qui avait déjà nécessité une reconstruction de table écrite à la main pour
`allocation_targets` (Milestone 2a) — d'où l'adoption d'un vrai outil de migration,
avec son mode batch qui automatise cette reconstruction pour SQLite.

Le chemin de la base est pilotable via la variable d'environnement `PATRIMOINE_DB`
(utile pour l'exploitation et pour isoler les tests d'une vraie `patrimoine.db`) ;
à défaut, `_chemin_base_par_defaut()` choisit l'emplacement. `alembic/env.py`
réutilise `DATABASE_URL` défini ici, pour qu'Alembic ouvre toujours exactement le
même fichier que l'application.
"""

import logging
import os
import sqlite3
from pathlib import Path

from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, sessionmaker

logger = logging.getLogger("patrimoine.database")

_RACINE_BACKEND = Path(__file__).resolve().parent.parent
_NOM_BASE = "patrimoine.db"
# Nom porté par la base avant que le projet ne soit renommé « Application Patrimoine ».
_NOM_BASE_HISTORIQUE = "portfolio.db"


def _base_semble_vide(chemin: Path) -> bool:
    """Une base sans table `holdings`, ou dont `holdings` ne contient aucune ligne,
    est considérée vide — critère utilisé uniquement par `_chemin_base_par_defaut`
    pour départager `nouveau` de `historique`, jamais ailleurs. N'importe quelle
    erreur (fichier verrouillé, pas une base SQLite valide...) est traitée comme
    « vide » : en cas de doute, on préfère risquer de retomber sur `historique`
    plutôt que de rater une base réellement vide."""
    if not chemin.exists():
        return True
    try:
        with sqlite3.connect(chemin) as con:
            table_existe = con.execute(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='holdings'"
            ).fetchone()[0]
            if not table_existe:
                return True
            return con.execute("SELECT COUNT(*) FROM holdings").fetchone()[0] == 0
    except sqlite3.Error:
        return True


def _chemin_base_par_defaut() -> Path:
    """Emplacement de la base quand `PATRIMOINE_DB` n'est pas défini.

    Le projet s'appelait « Outil Bourse » et sa base `portfolio.db`. Plutôt que
    d'imposer un renommage manuel du fichier — au risque qu'une installation
    existante démarre sur une base vide et donne l'impression d'avoir tout perdu —
    on continue d'utiliser l'ancien fichier tant qu'il contient les vraies données.

    Comparer le CONTENU (`_base_semble_vide`), pas seulement la présence du fichier
    `nouveau` : un incident réel du 19/08/2026 a montré qu'un `patrimoine.db` vide
    (schéma créé sans donnée — par un redémarrage accidentel, un outil tiers, ou
    n'importe quelle raison créant le fichier sans y écrire de portefeuille) suffit
    à faire échouer un simple test d'existence, masquant silencieusement les
    49 positions/4059 transactions bien réelles de `historique` au redémarrage
    suivant. Si `nouveau` contient déjà de vraies données, il reste prioritaire —
    ce repli ne s'applique qu'à un `patrimoine.db` réellement vide.
    """
    nouveau = _RACINE_BACKEND / _NOM_BASE
    historique = _RACINE_BACKEND / _NOM_BASE_HISTORIQUE
    if _base_semble_vide(nouveau) and not _base_semble_vide(historique):
        logger.info(
            "base de données : utilisation du fichier historique %s (%s est vide ou absent ; "
            "renommez %s en %s quand vous voulez, l'application suivra).",
            historique.name,
            _NOM_BASE,
            historique.name,
            _NOM_BASE,
        )
        return historique
    return nouveau


DB_PATH = Path(os.environ["PATRIMOINE_DB"]) if os.environ.get("PATRIMOINE_DB") else _chemin_base_par_defaut()
DATABASE_URL = f"sqlite:///{DB_PATH}"

# `timeout` (secondes) : passé tel quel à `sqlite3.connect`, il règle le
# `busy_timeout` SQLite de la connexion — une écriture concurrente ATTEND ce délai
# avant d'échouer en `database is locked`, plutôt que d'échouer immédiatement (repli
# par défaut de `sqlite3`, 5 s — trop court face à un job de fond qui peut tenir la
# connexion plusieurs dizaines de secondes, cf. `market_data_refresh.py`, backlog
# § T.2). Le mode WAL (`PRAGMA journal_mode=WAL`, posé sur chaque nouvelle connexion
# ci-dessous — c'est un réglage par connexion, pas par requête) réduit en plus la
# contention en autorisant les lecteurs à ne jamais attendre un écrivain en cours ;
# les deux réglages sont complémentaires, ni l'un ni l'autre ne suffit seul face à
# une transaction d'écriture tenue longtemps (cf. aussi le commit par ticker dans
# `market_data_service.refresh_tickers`, qui borne cette durée à la source).
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False, "timeout": 30})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@event.listens_for(engine, "connect")
def _activer_mode_wal(dbapi_connection, _connection_record) -> None:
    dbapi_connection.execute("PRAGMA journal_mode=WAL")


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def upgrade_schema() -> None:
    """Amène le schéma à la dernière révision Alembic (`backend/alembic/versions/`),
    aussi bien sur une base neuve (crée tout depuis zéro) que sur une base existante
    (applique uniquement les révisions manquantes) — remplace l'ancien duo
    `Base.metadata.create_all()` + fonctions de migration maison.

    Construit la config Alembic par programmation plutôt que de dépendre du
    répertoire courant du process (`alembic.ini` résolu depuis `_RACINE_BACKEND`,
    comme la base elle-même) et force `sqlalchemy.url` sur `DATABASE_URL` — la
    même résolution dynamique que le reste de l'application (`PATRIMOINE_DB`,
    repli sur l'ancien nom de base), pour qu'Alembic ouvre toujours exactement le
    fichier que `engine` ouvre déjà."""
    from alembic import command
    from alembic.config import Config

    cfg = Config(str(_RACINE_BACKEND / "alembic.ini"))
    cfg.set_main_option("script_location", str(_RACINE_BACKEND / "alembic"))
    cfg.set_main_option("sqlalchemy.url", DATABASE_URL)
    command.upgrade(cfg, "head")
