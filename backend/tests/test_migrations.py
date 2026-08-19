"""Verrouille les migrations au démarrage (`app.database`) sur une base préexistante :
ajout de colonne générique (`run_startup_migrations`, déjà en place avant ce lot,
appliqué ici à la nouvelle colonne `FundComposition.source` et, pour le LOT 3.4, à
`Holding.origine`) et renommage de contenu "Autres" -> "Autres zones"/"Autres
secteurs" (`migrate_rename_categorie_autres`, introduit par le LOT 2.2). Chaque
test pointe `app.database.engine` vers une base SQLite jetable dédiée, jamais la
vraie `patrimoine.db` ni celle des autres tests."""

import sqlite3

from sqlalchemy import create_engine, inspect, text

import app.database as database_module
from app.database import Base
from app.models import ORIGINE_RECONSTRUIT


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


def test_ajout_colonne_origine_sur_base_preexistante_retro_remplit_reconstruit(tmp_path, monkeypatch):
    """`holdings` créée avant l'ajout de la colonne `origine` (LOT 3.4) : la
    migration l'ajoute avec la valeur `ORIGINE_RECONSTRUIT` pour les lignes déjà
    présentes (`server_default`, cf. docstring de `models.Holding.origine`) —
    contrairement à `FundComposition.source` qui, elle, reste NULL rétroactivement
    (colonne sans `server_default`)."""
    chemin = tmp_path / "ancienne_base_holdings.db"
    conn = sqlite3.connect(chemin)
    conn.execute(
        """
        CREATE TABLE holdings (
            id INTEGER PRIMARY KEY,
            ticker VARCHAR,
            nom VARCHAR,
            quantite FLOAT,
            prix_revient_moyen FLOAT,
            compte VARCHAR,
            devise VARCHAR,
            type_actif VARCHAR,
            created_at DATETIME,
            updated_at DATETIME
        )
        """
    )
    conn.execute(
        "INSERT INTO holdings (ticker, quantite, created_at, updated_at) "
        "VALUES ('AAPL', 10.0, '2024-01-01 00:00:00', '2024-01-01 00:00:00')"
    )
    conn.commit()
    conn.close()

    test_engine = create_engine(f"sqlite:///{chemin}", connect_args={"check_same_thread": False})
    monkeypatch.setattr(database_module, "engine", test_engine)

    database_module.run_startup_migrations()

    inspector = inspect(test_engine)
    colonnes = {c["name"] for c in inspector.get_columns("holdings")}
    assert "origine" in colonnes

    with test_engine.connect() as conn2:
        lignes = conn2.execute(text("SELECT ticker, origine FROM holdings")).fetchall()

    assert lignes == [("AAPL", ORIGINE_RECONSTRUIT)]

    test_engine.dispose()


def test_ajout_colonne_origine_idempotent(tmp_path, monkeypatch):
    chemin = tmp_path / "base_holdings.db"
    test_engine = create_engine(f"sqlite:///{chemin}", connect_args={"check_same_thread": False})
    database_module.Base.metadata.create_all(bind=test_engine)
    monkeypatch.setattr(database_module, "engine", test_engine)

    database_module.run_startup_migrations()
    database_module.run_startup_migrations()  # ne doit pas lever d'exception

    inspector = inspect(test_engine)
    colonnes = {c["name"] for c in inspector.get_columns("holdings")}
    assert "origine" in colonnes

    test_engine.dispose()


def test_renommage_autres_couvre_aussi_le_look_through_deja_calcule(tmp_path, monkeypatch):
    """Les lignes de `fund_composition` produites avant le renommage portent encore
    l'ancien libellé « Autres » : sans migration symétrique, le graphique de
    répartition afficherait une catégorie fantôme à côté d'« Autres zones » jusqu'au
    prochain rafraîchissement des cours."""
    chemin = tmp_path / "look_through.db"
    engine_test = create_engine(f"sqlite:///{chemin}", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine_test)
    with engine_test.begin() as conn:
        conn.execute(
            text(
                "INSERT INTO fund_composition (ticker, type, categorie, poids, derniere_maj) VALUES "
                "('FONDS-A', 'geo', 'Autres', 0.3, '2026-01-01 00:00:00'), "
                "('FONDS-A', 'geo', 'Europe', 0.7, '2026-01-01 00:00:00'), "
                "('FONDS-B', 'sector', 'Autres', 1.0, '2026-01-01 00:00:00')"
            )
        )

    monkeypatch.setattr(database_module, "engine", engine_test)
    database_module.migrate_rename_categorie_autres()
    database_module.migrate_rename_categorie_autres()  # idempotence

    with engine_test.begin() as conn:
        lignes = sorted(conn.execute(text("SELECT ticker, type, categorie FROM fund_composition")).fetchall())

    assert lignes == [
        ("FONDS-A", "geo", "Autres zones"),
        ("FONDS-A", "geo", "Europe"),
        ("FONDS-B", "sector", "Autres secteurs"),
    ]
    engine_test.dispose()


def test_recalcul_des_zones_en_cache_distingue_zone_residuelle_et_donnee_manquante(tmp_path, monkeypatch):
    """La zone est figée en base au rafraîchissement des cours : les entrées écrites
    avant le LOT 2.2 portent l'ancienne catégorie "Autres", qui confondait « pays connu
    hors de nos zones » et « aucun pays connu ». Un renommage aveugle serait faux — la
    zone est donc reconstruite à partir du pays déjà stocké."""
    chemin = tmp_path / "regions.db"
    engine_test = create_engine(f"sqlite:///{chemin}", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine_test)
    with engine_test.begin() as conn:
        conn.execute(
            text(
                "INSERT INTO market_data_cache (ticker, pays, region, derniere_maj) VALUES "
                "('CRYPTO', NULL, 'Autres', '2026-01-01 00:00:00'), "        # aucun pays -> donnée manquante
                "('BERMUDES', 'Bermuda', 'Autres', '2026-01-01 00:00:00'), "  # pays connu hors zones -> zone résiduelle
                "('US', 'United States', 'Autres', '2026-01-01 00:00:00'), " # zone erronée à corriger
                "('FR', 'France', 'Europe', '2026-01-01 00:00:00')"          # déjà juste, ne doit pas bouger
            )
        )

    monkeypatch.setattr(database_module, "engine", engine_test)
    database_module.migrate_recalculer_regions_en_cache()
    database_module.migrate_recalculer_regions_en_cache()  # idempotence

    with engine_test.begin() as conn:
        zones = dict(conn.execute(text("SELECT ticker, region FROM market_data_cache")).fetchall())

    assert zones == {
        "CRYPTO": "Non catégorisé",
        "BERMUDES": "Autres zones",
        "US": "Amérique du Nord",
        "FR": "Europe",
    }
    engine_test.dispose()


def test_la_base_historique_est_reutilisee_apres_le_renommage_du_projet(tmp_path, monkeypatch):
    """Le projet s'appelait « Outil Bourse » et sa base `portfolio.db`. Une installation
    existante ne doit pas démarrer sur une base vide après la mise à jour : tant que
    l'ancien fichier est le seul présent, c'est lui qui est utilisé."""
    import importlib

    monkeypatch.delenv("PATRIMOINE_DB", raising=False)
    monkeypatch.setattr(database_module, "_RACINE_BACKEND", tmp_path)

    # Aucun fichier : une installation neuve vise le nouveau nom.
    assert database_module._chemin_base_par_defaut().name == "patrimoine.db"

    # Seule l'ancienne base existe : on la réutilise plutôt que d'en créer une vide.
    (tmp_path / "portfolio.db").write_bytes(b"")
    assert database_module._chemin_base_par_defaut().name == "portfolio.db"

    # Les deux existent : le nouveau nom prime (l'utilisateur a fait le renommage).
    (tmp_path / "patrimoine.db").write_bytes(b"")
    assert database_module._chemin_base_par_defaut().name == "patrimoine.db"

    del importlib  # garde-fou : aucun rechargement de module, on teste la fonction seule
