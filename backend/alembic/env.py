import sys
from pathlib import Path

from sqlalchemy import engine_from_config, pool

from alembic import context

# Permet d'importer `app.*` que ce script tourne via la CLI `alembic` (CWD =
# `backend/`, déjà suffisant) ou via `database.upgrade_schema()` invoqué par
# l'application (CWD potentiellement différent, ex. tests) — toujours résolu
# relativement à ce fichier, jamais au répertoire courant du process appelant.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.database import Base, DATABASE_URL  # noqa: E402
from app import models  # noqa: E402,F401 - déclare toutes les tables sur `Base.metadata` (sinon vide : aucun module ne les enregistre tant qu'il n'est pas importé)

config = context.config
# L'URL réelle (résolution dynamique du chemin de base, cf. `app.database` :
# variable d'environnement `PATRIMOINE_DB`, repli sur l'ancien nom `portfolio.db`)
# prime toujours sur le `sqlalchemy.url` placeholder d'`alembic.ini` — Alembic et
# l'application doivent absolument ouvrir le même fichier, sinon les tests (qui
# redirigent `PATRIMOINE_DB` vers un fichier jetable) migreraient la vraie base.
config.set_main_option("sqlalchemy.url", DATABASE_URL)

# Pas de `fileConfig(config.config_file_name)` ici (contrairement au template
# généré par `alembic init`) : `alembic.ini` ne déclare plus de section
# `[loggers]`/`[handlers]`/`[formatters]` — les journaux d'Alembic doivent
# s'intégrer à la configuration déjà posée par `app.logging_config.configure_logging()`
# (appelée avant `database.upgrade_schema()` dans `main.py`), pas installer leur
# propre configuration concurrente.

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        # SQLite n'autorise pas d'ALTER TABLE complexe (renommer/retyper une
        # colonne, changer une contrainte) : le mode batch automatise la danse
        # renommer/recréer/recopier/supprimer qu'il avait fallu écrire à la main
        # (et qui a buggé) pour `allocation_targets` au Milestone 2a.
        render_as_batch=True,
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata, render_as_batch=True)

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
