"""Verrouille `app.database._chemin_base_par_defaut` : sélection entre l'ancien nom
de base (`portfolio.db`) et le nouveau (`patrimoine.db`) selon leur contenu réel, pas
seulement leur présence (cf. incident du 19/08/2026 documenté ci-dessous).

Les migrations de schéma/contenu elles-mêmes (ADD COLUMN, renommage de catégorie,
isolation par utilisateur, préférences par utilisateur...) ne sont plus des fonctions
maison ici : elles passent par Alembic (backlog 2.I.4, `app.database.upgrade_schema`)
et sont verrouillées dans `tests/test_alembic_migrations.py`."""

import sqlite3

import app.database as database_module


def _creer_base_avec_holdings(chemin, nombre_lignes: int) -> None:
    """Simule une vraie base applicative (au moins la table `holdings`, seule
    consultée par `_base_semble_vide`) avec `nombre_lignes` positions."""
    con = sqlite3.connect(chemin)
    con.execute("CREATE TABLE holdings (id INTEGER PRIMARY KEY, ticker TEXT)")
    for i in range(nombre_lignes):
        con.execute("INSERT INTO holdings (ticker) VALUES (?)", (f"T{i}",))
    con.commit()
    con.close()


def test_la_base_historique_est_reutilisee_apres_le_renommage_du_projet(tmp_path, monkeypatch):
    """Le projet s'appelait « Outil Bourse » et sa base `portfolio.db`. Une installation
    existante ne doit pas démarrer sur une base vide après la mise à jour : tant que
    l'ancien fichier est le seul à contenir de vraies données, c'est lui qui est
    utilisé."""
    monkeypatch.delenv("PATRIMOINE_DB", raising=False)
    monkeypatch.setattr(database_module, "_RACINE_BACKEND", tmp_path)

    # Aucun fichier : une installation neuve vise le nouveau nom.
    assert database_module._chemin_base_par_defaut().name == "patrimoine.db"

    # Seule l'ancienne base existe, avec de vraies positions : on la réutilise
    # plutôt que d'en créer une vide.
    _creer_base_avec_holdings(tmp_path / "portfolio.db", 49)
    assert database_module._chemin_base_par_defaut().name == "portfolio.db"

    # Les deux existent, toutes deux avec des données : le nouveau nom prime
    # (l'utilisateur a fait le renommage).
    _creer_base_avec_holdings(tmp_path / "patrimoine.db", 49)
    assert database_module._chemin_base_par_defaut().name == "patrimoine.db"


def test_un_patrimoine_db_vide_ne_masque_pas_lhistorique_avec_de_vraies_donnees(tmp_path, monkeypatch):
    """Incident réel du 19/08/2026 : un `patrimoine.db` créé vide (schéma sans
    donnée — par un redémarrage accidentel avant qu'un renommage manuel n'ait eu
    lieu, ou tout autre outil créant le fichier sans y écrire de portefeuille)
    faisait échouer le test d'existence de l'ancienne logique, masquant
    silencieusement les vraies données de `portfolio.db` au redémarrage suivant.
    `_chemin_base_par_defaut` doit comparer le CONTENU, pas seulement la présence
    du fichier `patrimoine.db`."""
    monkeypatch.delenv("PATRIMOINE_DB", raising=False)
    monkeypatch.setattr(database_module, "_RACINE_BACKEND", tmp_path)

    _creer_base_avec_holdings(tmp_path / "patrimoine.db", 0)  # schéma créé, aucune ligne
    _creer_base_avec_holdings(tmp_path / "portfolio.db", 49)

    assert database_module._chemin_base_par_defaut().name == "portfolio.db"


def test_deux_bases_vides_preferent_le_nouveau_nom(tmp_path, monkeypatch):
    """Ni l'une ni l'autre n'a de vraies données : pas de raison de préférer
    l'ancien nom, l'installation part sur `patrimoine.db` comme une base neuve."""
    monkeypatch.delenv("PATRIMOINE_DB", raising=False)
    monkeypatch.setattr(database_module, "_RACINE_BACKEND", tmp_path)

    (tmp_path / "portfolio.db").write_bytes(b"")

    assert database_module._chemin_base_par_defaut().name == "patrimoine.db"
