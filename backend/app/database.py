"""Connexion SQLite + migrations automatiques au démarrage.

`Base.metadata.create_all()` crée les tables manquantes mais ne modifie jamais une
table déjà existante : si un modèle gagne une colonne ou une contrainte, la base
d'une installation existante doit être mise à jour explicitement. `run_startup_migrations`
fait ça automatiquement (ADD COLUMN / CREATE UNIQUE INDEX), de façon idempotente et
jamais destructive — aucune donnée n'est jamais supprimée ou modifiée.

Le chemin de la base est pilotable via la variable d'environnement `OUTIL_BOURSE_DB`
(utile pour l'exploitation et pour isoler les tests d'une vraie `portfolio.db`) ;
à défaut, on garde l'emplacement historique.
"""

import logging
import os
from pathlib import Path

from sqlalchemy import UniqueConstraint, create_engine, inspect, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker

logger = logging.getLogger("outil_bourse.database")

_DB_PATH_PAR_DEFAUT = Path(__file__).resolve().parent.parent / "portfolio.db"
DB_PATH = Path(os.environ["OUTIL_BOURSE_DB"]) if os.environ.get("OUTIL_BOURSE_DB") else _DB_PATH_PAR_DEFAUT
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
                # Si le modèle déclare un `server_default` (ex. `Holding.origine`), on
                # l'inclut dans le ADD COLUMN : SQLite rétro-remplit alors les lignes déjà
                # présentes avec cette valeur au lieu de les laisser NULL, cf. docstring
                # de `Holding.origine`. Seules les valeurs texte simples sont supportées
                # (seul cas rencontré à ce jour) ; échapper les apostrophes suffit donc.
                clause_defaut = ""
                if colonne.server_default is not None and isinstance(colonne.server_default.arg, str):
                    valeur_echappee = colonne.server_default.arg.replace("'", "''")
                    clause_defaut = f" DEFAULT '{valeur_echappee}'"
                conn.execute(text(f'ALTER TABLE "{table.name}" ADD COLUMN "{colonne.name}" {type_sql}{clause_defaut}'))
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


def migrate_rename_categorie_autres() -> None:
    """Renomme les objectifs enregistrés sous l'ancienne catégorie fourre-tout
    "Autres" vers les nouveaux libellés "Autres zones" (géo) / "Autres secteurs"
    (secteur), introduits pour distinguer une zone/un secteur résiduel connu d'une
    donnée simplement manquante (cf. LOT 2.2, `reference_indices.NON_CATEGORISE`).

    Migration de *contenu* (mise à jour de données existantes), volontairement
    séparée de `run_startup_migrations` qui ne fait que de la migration de *schéma*
    (ADD COLUMN / CREATE UNIQUE INDEX) : mélanger les deux aurait rendu cette
    fonction-ci moins prévisible et plus difficile à tester isolément. Appelée une
    fois au démarrage juste après `run_startup_migrations`, dans `main.py`.

    Idempotente et jamais destructive : un UPDATE ciblé sur `categorie = 'Autres'`,
    qui ne trouve donc plus rien à faire dès la deuxième exécution. Protégée contre
    la contrainte d'unicité (annee, type, categorie) : si une ligne "Autres zones"/
    "Autres secteurs" existe déjà pour la même année (ex. l'utilisateur les a créées
    manuellement avant cette migration), la ligne "Autres" correspondante est laissée
    telle quelle plutôt que de provoquer une erreur ou d'écraser une valeur saisie."""
    inspector = inspect(engine)
    if "allocation_targets" not in inspector.get_table_names():
        return  # base neuve : create_all() vient de créer une table vide, rien à renommer

    renommages = (("geo", "Autres", "Autres zones"), ("sector", "Autres", "Autres secteurs"))
    with engine.begin() as conn:
        for type_, ancienne, nouvelle in renommages:
            resultat = conn.execute(
                text(
                    """
                    UPDATE allocation_targets
                    SET categorie = :nouvelle
                    WHERE type = :type_ AND categorie = :ancienne
                      AND NOT EXISTS (
                          SELECT 1 FROM allocation_targets AS existante
                          WHERE existante.annee = allocation_targets.annee
                            AND existante.type = allocation_targets.type
                            AND existante.categorie = :nouvelle
                      )
                    """
                ),
                {"type_": type_, "ancienne": ancienne, "nouvelle": nouvelle},
            )
            if resultat.rowcount:
                logger.info(
                    "migration: %d ligne(s) allocation_targets renommée(s) de '%s' vers '%s' (type=%s)",
                    resultat.rowcount,
                    ancienne,
                    nouvelle,
                    type_,
                )
