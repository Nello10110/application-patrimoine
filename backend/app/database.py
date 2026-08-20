"""Connexion SQLite + migrations automatiques au démarrage.

`Base.metadata.create_all()` crée les tables manquantes mais ne modifie jamais une
table déjà existante : si un modèle gagne une colonne ou une contrainte, la base
d'une installation existante doit être mise à jour explicitement. `run_startup_migrations`
fait ça automatiquement (ADD COLUMN / CREATE UNIQUE INDEX), de façon idempotente et
jamais destructive — aucune donnée n'est jamais supprimée ou modifiée.

Le chemin de la base est pilotable via la variable d'environnement `PATRIMOINE_DB`
(utile pour l'exploitation et pour isoler les tests d'une vraie `patrimoine.db`) ;
à défaut, `_chemin_base_par_defaut()` choisit l'emplacement.
"""

import logging
import os
import sqlite3
from pathlib import Path

from sqlalchemy import UniqueConstraint, create_engine, inspect, text
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
    tables = set(inspector.get_table_names())
    if "allocation_targets" not in tables:
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

        # Les lignes de look-through déjà calculées portent elles aussi l'ancien
        # libellé : sans ce renommage, le graphique afficherait une catégorie "Autres"
        # fantôme à côté de "Autres zones" jusqu'au prochain rafraîchissement des
        # cours (qui les réécrit toutes). Même UPDATE ciblé, même idempotence ; la
        # contrainte d'unicité porte ici sur (ticker, type, categorie).
        if "fund_composition" in tables:
            for type_, ancienne, nouvelle in renommages:
                resultat = conn.execute(
                    text(
                        """
                        UPDATE fund_composition
                        SET categorie = :nouvelle
                        WHERE type = :type_ AND categorie = :ancienne
                          AND NOT EXISTS (
                              SELECT 1 FROM fund_composition AS existante
                              WHERE existante.ticker = fund_composition.ticker
                                AND existante.type = fund_composition.type
                                AND existante.categorie = :nouvelle
                          )
                        """
                    ),
                    {"type_": type_, "ancienne": ancienne, "nouvelle": nouvelle},
                )
                if resultat.rowcount:
                    logger.info(
                        "migration: %d ligne(s) fund_composition renommée(s) de '%s' vers '%s' (type=%s)",
                        resultat.rowcount,
                        ancienne,
                        nouvelle,
                        type_,
                    )


def migrate_recalculer_regions_en_cache() -> None:
    """Recalcule `market_data_cache.region` à partir du pays déjà stocké.

    La zone géographique est figée en base au moment du rafraîchissement des cours.
    Les entrées écrites avant le LOT 2.2 portent donc l'ancienne catégorie fourre-tout
    "Autres", qui confondait deux situations désormais distinctes : un pays connu mais
    hors de nos zones ("Autres zones") et une absence pure de donnée ("Non catégorisé",
    cas de la crypto ou d'un titre dont le fournisseur ne renvoie aucun pays).

    Un simple renommage serait donc faux. Comme `pays` est stocké à côté de `region`,
    on peut reconstruire la zone exactement comme le ferait le code actuel, sans aucun
    appel réseau et sans attendre le prochain rafraîchissement. Idempotente par
    construction : rejouer la fonction recalcule les mêmes valeurs.
    """
    inspector = inspect(engine)
    if "market_data_cache" not in inspector.get_table_names():
        return

    from .services.reference_indices import region_for_country

    with engine.begin() as conn:
        lignes = conn.execute(text("SELECT ticker, pays, region FROM market_data_cache")).fetchall()
        corrigees = 0
        for ticker, pays, region in lignes:
            attendue = region_for_country(pays)
            if region == attendue:
                continue
            conn.execute(
                text("UPDATE market_data_cache SET region = :region WHERE ticker = :ticker"),
                {"region": attendue, "ticker": ticker},
            )
            corrigees += 1

    if corrigees:
        logger.info("migration: zone géographique recalculée pour %d entrée(s) de market_data_cache", corrigees)


def migrate_isolation_utilisateur() -> None:
    """Multi-utilisateur (Milestone 2a, `docs/BACKLOG.md` § 2.I.1) : rattache toutes
    les lignes `holdings`/`loans`/`transactions`/`allocation_targets` existantes à un
    utilisateur, et corrige les contraintes d'unicité devenues trop larges maintenant
    que plusieurs utilisateurs peuvent exister.

    À appeler après `run_startup_migrations()`, qui a déjà ajouté la colonne
    `user_id` (nullable — `ADD COLUMN` ne pose jamais de `NOT NULL`) sur les 4 tables.

    Rattachement au compte `demo` : choix explicite de l'utilisateur (20/08/2026),
    fait au moment où les seules données réelles de l'application n'avaient encore
    aucune notion de propriétaire. Un futur transfert vers un autre compte reste une
    opération manuelle en base, hors périmètre de cette migration automatique.

    `allocation_targets` a un traitement à part : son ancienne contrainte unique
    `(annee, type, categorie)` a été déclarée au moment de la création de la table
    (`__table_args__`), donc SQLite la représente en interne par un
    `sqlite_autoindex_...` — un index que `DROP INDEX` refuse explicitement de
    supprimer (message SQLite : « index associated with UNIQUE or PRIMARY KEY
    constraint cannot be dropped »). La seule façon de la remplacer par la version à
    4 colonnes (avec `user_id`) est de reconstruire la table : renommer l'ancienne,
    recréer la nouvelle depuis le modèle actuel (garantit un schéma toujours
    synchronisé avec `models.py`), recopier les données, supprimer l'ancienne.
    `transactions.transaction_id` n'a pas ce problème : son ancienne contrainte
    unique est un index nommé ordinaire (`ix_transactions_transaction_id`, posé via
    `Column(unique=True)`), qu'un `DROP INDEX` classique supprime sans souci.
    """
    inspector = inspect(engine)
    tables = set(inspector.get_table_names())
    if "users" not in tables:
        return  # base neuve : aucune des tables métier n'a encore de données à rattacher

    from .models import AllocationTarget

    with engine.begin() as conn:
        demo_id = conn.execute(text("SELECT id FROM users WHERE username = 'demo'")).scalar()

    # --- holdings / loans / transactions : ADD COLUMN déjà fait, il ne reste que le
    # rattachement des lignes existantes (idempotent : n'affecte que `user_id IS NULL`).
    if demo_id is not None:
        with engine.begin() as conn:
            for table in ("holdings", "loans", "transactions"):
                if table not in tables:
                    continue
                colonnes = {c["name"] for c in inspector.get_columns(table)}
                if "user_id" not in colonnes:
                    continue  # run_startup_migrations n'est pas encore passé par là (ordre d'appel)
                resultat = conn.execute(
                    text(f'UPDATE "{table}" SET user_id = :demo_id WHERE user_id IS NULL'),
                    {"demo_id": demo_id},
                )
                if resultat.rowcount:
                    logger.info("migration: %d ligne(s) de %s rattachée(s) au compte demo", resultat.rowcount, table)

    # --- transactions : contrainte unique globale -> par utilisateur.
    if "transactions" in tables:
        index_transactions = {ix["name"] for ix in inspector.get_indexes("transactions")}
        if "ix_transactions_transaction_id" in index_transactions:
            with engine.begin() as conn:
                conn.execute(text('DROP INDEX "ix_transactions_transaction_id"'))
            logger.info("migration: ancien index unique global sur transactions.transaction_id supprimé")
            # `run_startup_migrations` (déjà passé avant cet appel, cf. `main.py`) a
            # déjà créé la nouvelle `UniqueConstraint("transaction_id", "user_id")`
            # du modèle dans le même cycle de démarrage (ADD COLUMN puis CREATE UNIQUE
            # INDEX passent par la même transaction) — elle coexistait donc brièvement
            # avec l'ancien index à colonne unique ci-dessus, plus restrictif ; sa
            # suppression ici est ce qui rend la nouvelle contrainte effective.

    # --- allocation_targets : reconstruction complète (cf. docstring).
    if "allocation_targets" in tables:
        # La reconstruction est nécessaire tant que l'ANCIENNE contrainte à 3 colonnes
        # (sans `user_id`, héritée du schéma pré-Milestone 2a) existe encore — pas
        # simplement tant que la nouvelle n'existe pas : `run_startup_migrations`
        # (déjà passé avant cet appel) crée la nouvelle `UniqueConstraint("user_id",
        # "annee", "type", "categorie")` du modèle dès que la colonne `user_id`
        # existe, via un `CREATE UNIQUE INDEX` séparé qui COEXISTE avec l'ancienne
        # contrainte inline plutôt que de la remplacer. Sans reconstruction complète
        # ici, l'ancienne contrainte à 3 colonnes resterait active et interdirait à
        # deux utilisateurs différents de partager la même combinaison (année, type,
        # catégorie) — exactement le bug que ce Milestone doit lever. Une contrainte
        # unique existe soit comme contrainte de table (`get_unique_constraints`, cas
        # d'une déclaration inline au moment du CREATE TABLE), soit comme index unique
        # nommé (`get_indexes`, cas d'un `CREATE UNIQUE INDEX` séparé) : les deux
        # formes comptent, comme dans `run_startup_migrations` lui-même.
        ancienne = tuple(sorted(["annee", "type", "categorie"]))
        contraintes_uniques = {
            tuple(sorted(uc["column_names"])) for uc in inspector.get_unique_constraints("allocation_targets")
        }
        index_uniques = {
            tuple(sorted(ix["column_names"])) for ix in inspector.get_indexes("allocation_targets") if ix["unique"]
        }
        if ancienne in contraintes_uniques or ancienne in index_uniques:
            colonnes_avant = {c["name"] for c in inspector.get_columns("allocation_targets")}
            avait_deja_user_id = "user_id" in colonnes_avant
            # SQLite ne renomme jamais les index existants avec leur table (`ALTER
            # TABLE ... RENAME` les laisse pointer vers la table renommée sous leur
            # nom d'origine) : sans les supprimer ici, `AllocationTarget.__table__.create`
            # échouerait juste après en tentant de recréer un index de même nom
            # (`ix_allocation_targets_annee`, ou l'index unique que `run_startup_migrations`
            # vient tout juste de créer ci-dessus). Seuls les index NOMMÉS comptent :
            # un `sqlite_autoindex_*` (contrainte inline d'origine) disparaît de
            # lui-même avec la table qui le porte, au DROP TABLE plus bas.
            noms_index_a_supprimer = [ix["name"] for ix in inspector.get_indexes("allocation_targets") if ix["name"]]

            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE allocation_targets RENAME TO allocation_targets_avant_migration"))
                for nom_index in noms_index_a_supprimer:
                    conn.execute(text(f'DROP INDEX IF EXISTS "{nom_index}"'))

            AllocationTarget.__table__.create(bind=engine)

            with engine.begin() as conn:
                if avait_deja_user_id:
                    conn.execute(
                        text(
                            """
                            INSERT INTO allocation_targets (id, user_id, annee, type, categorie, pourcentage_cible)
                            SELECT id, COALESCE(user_id, :demo_id), annee, type, categorie, pourcentage_cible
                            FROM allocation_targets_avant_migration
                            """
                        ),
                        {"demo_id": demo_id},
                    )
                else:
                    conn.execute(
                        text(
                            """
                            INSERT INTO allocation_targets (id, user_id, annee, type, categorie, pourcentage_cible)
                            SELECT id, :demo_id, annee, type, categorie, pourcentage_cible
                            FROM allocation_targets_avant_migration
                            """
                        ),
                        {"demo_id": demo_id},
                    )
                conn.execute(text("DROP TABLE allocation_targets_avant_migration"))
            logger.info("migration: allocation_targets reconstruite avec user_id et sa nouvelle contrainte unique")
