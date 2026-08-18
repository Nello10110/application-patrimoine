"""Verrouille les migrations au démarrage (`app.database`) sur une base préexistante :
ajout de colonne générique (`run_startup_migrations`, déjà en place avant ce lot,
appliqué ici à la nouvelle colonne `FundComposition.source`) et renommage de contenu
"Autres" -> "Autres zones"/"Autres secteurs" (`migrate_rename_categorie_autres`,
introduit par le LOT 2.2). Chaque test pointe `app.database.engine` vers une base
SQLite jetable dédiée, jamais la vraie `portfolio.db` ni celle des autres tests."""

import sqlite3

from sqlalchemy import create_engine, inspect, text

import app.database as database_module


def test_ajout_colonne_source_sur_base_preexistante(tmp_path, monkeypatch):
    """`fund_composition` créée avant l'ajout de la colonne `source` (schéma figé,
    comme une vraie base existante) : la migration l'ajoute sans perdre les lignes
    déjà présentes."""
    chemin = tmp_path / "ancienne_base.db"
    conn = sqlite3.connect(chemin)
    conn.execute(
        """
        CREATE TABLE fund_composition (
            id INTEGER PRIMARY KEY,
            ticker VARCHAR,
            type VARCHAR,
            categorie VARCHAR,
            poids FLOAT,
            derniere_maj DATETIME
        )
        """
    )
    conn.execute(
        "INSERT INTO fund_composition (ticker, type, categorie, poids, derniere_maj) "
        "VALUES ('ETF1', 'geo', 'Europe', 1.0, '2024-01-01 00:00:00')"
    )
    conn.commit()
    conn.close()

    test_engine = create_engine(f"sqlite:///{chemin}", connect_args={"check_same_thread": False})
    monkeypatch.setattr(database_module, "engine", test_engine)

    database_module.run_startup_migrations()

    inspector = inspect(test_engine)
    colonnes = {c["name"] for c in inspector.get_columns("fund_composition")}
    assert "source" in colonnes

    with test_engine.connect() as conn2:
        lignes = conn2.execute(text("SELECT ticker, categorie, poids, source FROM fund_composition")).fetchall()

    assert len(lignes) == 1
    assert lignes[0][0] == "ETF1"
    assert lignes[0][1] == "Europe"
    assert lignes[0][2] == 1.0
    assert lignes[0][3] is None  # colonne neuve : pas de donnée rétroactive, valeur NULL

    test_engine.dispose()


def test_ajout_colonne_source_idempotent(tmp_path, monkeypatch):
    """Appliquer la migration deux fois de suite ne doit pas planter (colonne déjà
    présente à la deuxième exécution)."""
    chemin = tmp_path / "base.db"
    test_engine = create_engine(f"sqlite:///{chemin}", connect_args={"check_same_thread": False})
    database_module.Base.metadata.create_all(bind=test_engine)
    monkeypatch.setattr(database_module, "engine", test_engine)

    database_module.run_startup_migrations()
    database_module.run_startup_migrations()  # ne doit pas lever d'exception

    inspector = inspect(test_engine)
    colonnes = {c["name"] for c in inspector.get_columns("fund_composition")}
    assert "source" in colonnes

    test_engine.dispose()


def _inserer_objectif(engine, annee, type_, categorie, pourcentage):
    with engine.begin() as conn:
        conn.execute(
            text(
                "INSERT INTO allocation_targets (annee, type, categorie, pourcentage_cible) "
                "VALUES (:annee, :type_, :categorie, :pourcentage)"
            ),
            {"annee": annee, "type_": type_, "categorie": categorie, "pourcentage": pourcentage},
        )


def test_renommage_autres_vers_autres_zones_et_autres_secteurs(tmp_path, monkeypatch):
    chemin = tmp_path / "base_objectifs.db"
    test_engine = create_engine(f"sqlite:///{chemin}", connect_args={"check_same_thread": False})
    database_module.Base.metadata.create_all(bind=test_engine)
    monkeypatch.setattr(database_module, "engine", test_engine)

    _inserer_objectif(test_engine, 2026, "geo", "Autres", 16.65)
    _inserer_objectif(test_engine, 2026, "sector", "Autres", 5.0)
    _inserer_objectif(test_engine, 2026, "geo", "Europe", 20.0)  # ne doit pas être touchée

    database_module.migrate_rename_categorie_autres()

    with test_engine.connect() as conn:
        lignes = conn.execute(text("SELECT type, categorie, pourcentage_cible FROM allocation_targets")).fetchall()
    par_type_categorie = {(l[0], l[1]): l[2] for l in lignes}

    assert par_type_categorie[("geo", "Autres zones")] == 16.65
    assert par_type_categorie[("sector", "Autres secteurs")] == 5.0
    assert par_type_categorie[("geo", "Europe")] == 20.0
    assert ("geo", "Autres") not in par_type_categorie
    assert ("sector", "Autres") not in par_type_categorie

    test_engine.dispose()


def test_renommage_autres_idempotent(tmp_path, monkeypatch):
    chemin = tmp_path / "base_objectifs_idempotent.db"
    test_engine = create_engine(f"sqlite:///{chemin}", connect_args={"check_same_thread": False})
    database_module.Base.metadata.create_all(bind=test_engine)
    monkeypatch.setattr(database_module, "engine", test_engine)

    _inserer_objectif(test_engine, 2026, "geo", "Autres", 16.65)

    database_module.migrate_rename_categorie_autres()
    database_module.migrate_rename_categorie_autres()
    database_module.migrate_rename_categorie_autres()

    with test_engine.connect() as conn:
        lignes = conn.execute(text("SELECT type, categorie, pourcentage_cible FROM allocation_targets")).fetchall()

    # une seule ligne, renommée une seule fois (pas de doublon créé par les
    # exécutions répétées)
    assert lignes == [("geo", "Autres zones", 16.65)]

    test_engine.dispose()


def test_renommage_autres_ne_ecrase_pas_une_ligne_deja_migree(tmp_path, monkeypatch):
    """Si `annee`/`type` a déjà une ligne "Autres zones" (ex. créée manuellement par
    l'utilisateur avant cette migration) et une ligne "Autres" résiduelle pour la
    même année, la contrainte d'unicité (annee, type, categorie) empêcherait de les
    fusionner : la migration laisse alors "Autres" telle quelle plutôt que de
    planter ou d'écraser la valeur déjà en place."""
    chemin = tmp_path / "base_conflit.db"
    test_engine = create_engine(f"sqlite:///{chemin}", connect_args={"check_same_thread": False})
    database_module.Base.metadata.create_all(bind=test_engine)
    monkeypatch.setattr(database_module, "engine", test_engine)

    _inserer_objectif(test_engine, 2026, "geo", "Autres", 16.65)
    _inserer_objectif(test_engine, 2026, "geo", "Autres zones", 10.0)

    database_module.migrate_rename_categorie_autres()  # ne doit pas lever d'exception

    with test_engine.connect() as conn:
        lignes = conn.execute(
            text("SELECT categorie, pourcentage_cible FROM allocation_targets ORDER BY categorie")
        ).fetchall()

    assert ("Autres", 16.65) in lignes
    assert ("Autres zones", 10.0) in lignes

    test_engine.dispose()
