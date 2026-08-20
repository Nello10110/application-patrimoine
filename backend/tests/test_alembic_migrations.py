"""Verrouille l'adoption d'Alembic (backlog 2.I.4) comme unique mécanisme de
migration de schéma, à la place des anciennes fonctions maison retirées de
`app/database.py` (`run_startup_migrations` et les migrations de contenu one-off).

`app.database.upgrade_schema()` a déjà tourné une fois au tout premier import de
`app.main` par la suite de tests (`backend/conftest.py` redirige `PATRIMOINE_DB`
vers un fichier jetable avant cet import, cf. sa docstring) : la base pointée par
`app.database.engine` est donc déjà à la révision la plus récente au moment où ces
tests s'exécutent — pas besoin de la recréer, juste de vérifier son état."""

from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from sqlalchemy import text

from app.database import Base, engine, upgrade_schema


def test_upgrade_schema_est_idempotent():
    """Rejouer `upgrade_schema()` sur une base déjà à jour ne doit lever aucune
    exception (comportement natif d'Alembic : aucune révision restant à appliquer,
    `command.upgrade` ne fait rien)."""
    upgrade_schema()  # ne doit pas lever d'exception


def test_le_schema_reel_correspond_exactement_a_models_py():
    """Verrou central : si `models.py` change sans qu'une nouvelle révision Alembic
    ne soit générée (`alembic revision --autogenerate`), ce test échoue avant que
    quiconque ne le découvre au démarrage d'une vraie base — exactement le genre
    d'écart silencieux qui avait permis à la contrainte unique obsolète de
    `allocation_targets` de survivre en production jusqu'au Milestone 2a."""
    with engine.connect() as conn:
        contexte = MigrationContext.configure(conn)
        differences = compare_metadata(contexte, Base.metadata)

    assert differences == []


def test_la_base_est_bien_stampee_par_alembic():
    """Confirme que le schéma vient réellement d'`upgrade_schema()` (via Alembic,
    table `alembic_version` peuplée) et non d'un `Base.metadata.create_all()` isolé
    qui laisserait la base sans historique de révision."""
    with engine.connect() as conn:
        version = conn.execute(text("SELECT version_num FROM alembic_version")).scalar()

    assert version is not None
