"""Verrouille la migration `95d5e30459ea` (détail des frais d'acquisition immobilier
en 3 postes + champs du simulateur achat/location, retour utilisateur du 10/09/2026) :
une base existante avec un `frais_acquisition` déjà saisi doit migrer sans perte de
donnée (bascule dans `frais_acquisition_autres`, faute de connaître la répartition
notaire/travaux), et le downgrade doit recombiner exactement la même somme.

Isolé de la base partagée des autres tests (`conftest.db`, déjà à `head`) : ce test a
besoin de contrôler lui-même la révision de DÉPART pour recréer l'état "avant
migration" — `PATRIMOINE_DB` ne suffit pas ici, `alembic/env.py` lit
`app.database.DATABASE_URL` à chaque exécution d'Alembic, d'où le monkeypatch direct
de cet attribut plutôt que de la variable d'environnement (même mécanique que
`app.database.upgrade_schema`, dont ce test reprend la construction de `Config`)."""

from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text

import app.database as database_module

REVISION_PRECEDENTE = "3a42a82adf63"
REVISION_MIGREE = "95d5e30459ea"

_RACINE_BACKEND = Path(__file__).resolve().parent.parent


def _config_pour(chemin_db: Path) -> Config:
    cfg = Config(str(_RACINE_BACKEND / "alembic.ini"))
    cfg.set_main_option("script_location", str(_RACINE_BACKEND / "alembic"))
    cfg.set_main_option("sqlalchemy.url", f"sqlite:///{chemin_db}")
    return cfg


def test_upgrade_bascule_lancien_frais_acquisition_dans_autres_sans_perte(tmp_path, monkeypatch):
    chemin_db = tmp_path / "scratch_migration.db"
    monkeypatch.setattr(database_module, "DATABASE_URL", f"sqlite:///{chemin_db}")
    cfg = _config_pour(chemin_db)

    # État "avant" : schéma amené jusqu'à la révision précédente (donc avec l'ancienne
    # colonne unique `frais_acquisition`), puis une ligne y est saisie comme le ferait
    # un utilisateur réel avant cette mise à jour.
    command.upgrade(cfg, REVISION_PRECEDENTE)
    engine = create_engine(f"sqlite:///{chemin_db}")
    with engine.begin() as conn:
        conn.execute(
            text(
                "INSERT INTO holding_immobilier_details (holding_id, frais_acquisition, created_at, updated_at) "
                "VALUES (1, 15000.0, '2026-01-01 00:00:00', '2026-01-01 00:00:00')"
            )
        )
    engine.dispose()

    command.upgrade(cfg, REVISION_MIGREE)

    engine = create_engine(f"sqlite:///{chemin_db}")
    with engine.connect() as conn:
        colonnes = {row[1] for row in conn.execute(text("PRAGMA table_info(holding_immobilier_details)"))}
        ligne = conn.execute(
            text("SELECT frais_notaire, frais_travaux, frais_acquisition_autres FROM holding_immobilier_details WHERE holding_id = 1")
        ).one()
    engine.dispose()

    assert "frais_acquisition" not in colonnes
    assert {"frais_notaire", "frais_travaux", "frais_acquisition_autres", "simulation_loyer_estime"} <= colonnes
    assert ligne == (None, None, 15000.0)


def test_downgrade_recombine_les_trois_postes_en_un_seul_total(tmp_path, monkeypatch):
    chemin_db = tmp_path / "scratch_migration_downgrade.db"
    monkeypatch.setattr(database_module, "DATABASE_URL", f"sqlite:///{chemin_db}")
    cfg = _config_pour(chemin_db)

    command.upgrade(cfg, REVISION_MIGREE)
    engine = create_engine(f"sqlite:///{chemin_db}")
    with engine.begin() as conn:
        conn.execute(
            text(
                "INSERT INTO holding_immobilier_details "
                "(holding_id, frais_notaire, frais_travaux, frais_acquisition_autres, created_at, updated_at) "
                "VALUES (1, 10000.0, 5000.0, NULL, '2026-01-01 00:00:00', '2026-01-01 00:00:00')"
            )
        )
    engine.dispose()

    command.downgrade(cfg, REVISION_PRECEDENTE)

    engine = create_engine(f"sqlite:///{chemin_db}")
    with engine.connect() as conn:
        colonnes = {row[1] for row in conn.execute(text("PRAGMA table_info(holding_immobilier_details)"))}
        frais_acquisition = conn.execute(text("SELECT frais_acquisition FROM holding_immobilier_details WHERE holding_id = 1")).scalar()
    engine.dispose()

    assert "frais_acquisition" in colonnes
    assert "frais_notaire" not in colonnes
    assert frais_acquisition == 15000.0
