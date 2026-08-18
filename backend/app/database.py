"""Connexion SQLite + migrations automatiques au démarrage.

`Base.metadata.create_all()` crée les tables manquantes mais ne modifie jamais une
table déjà existante : si un modèle gagne une colonne ou une contrainte, la base
d'une installation existante doit être mise à jour explicitement. `run_startup_migrations`
fait ça automatiquement (ADD COLUMN / CREATE UNIQUE INDEX), de façon idempotente et
jamais destructive — aucune donnée n'est jamais supprimée ou modifiée.
"""

import logging
from pathlib import Path

from sqlalchemy import UniqueConstraint, create_engine, inspect, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker

logger = logging.getLogger("outil_bourse.database")

DB_PATH = Path(__file__).resolve().parent.parent / "portfolio.db"
DATABASE_URL = f"sqlite:///{DB_PATH}"

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def run_startup_migrations() -> None:
    """À appeler après `Base.metadata.create_all()`. Pour chaque table déjà
    existante, ajoute les colonnes et index uniques déclarés dans les modèles mais
    absents en base. Ne touche jamais une table qui vient d'être créée (déjà
    conforme) ni une donnée existante."""
    inspector = inspect(engine)
    tables_existantes = set(inspector.get_table_names())

    with engine.begin() as conn:
        for table in Base.metadata.sorted_tables:
            if table.name not in tables_existantes:
                continue  # table neuve : create_all() l'a déjà créée à jour

            colonnes_existantes = {col["name"] for col in inspector.get_columns(table.name)}
            for colonne in table.columns:
                if colonne.name in colonnes_existantes:
                    continue
                type_sql = colonne.type.compile(dialect=engine.dialect)
                conn.execute(text(f'ALTER TABLE "{table.name}" ADD COLUMN "{colonne.name}" {type_sql}'))
                logger.info("migration: colonne %s.%s ajoutée", table.name, colonne.name)

            index_uniques_existants = {
                tuple(sorted(ix["column_names"])) for ix in inspector.get_indexes(table.name) if ix["unique"]
            }
            contraintes_uniques_existantes = {
                tuple(sorted(uc["column_names"])) for uc in inspector.get_unique_constraints(table.name)
            }
            for contrainte in table.constraints:
                if not isinstance(contrainte, UniqueConstraint):
                    continue
                colonnes = tuple(sorted(c.name for c in contrainte.columns))
                if colonnes in index_uniques_existants or colonnes in contraintes_uniques_existantes:
                    continue
                nom_index = contrainte.name or f"uq_{table.name}_{'_'.join(colonnes)}"
                colonnes_sql = ", ".join(f'"{c}"' for c in colonnes)
                conn.execute(text(f'CREATE UNIQUE INDEX IF NOT EXISTS "{nom_index}" ON "{table.name}" ({colonnes_sql})'))
                logger.info("migration: index unique %s créé sur %s", nom_index, table.name)
