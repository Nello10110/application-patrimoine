"""Chargement du `.env` du dépôt (03/09/2026).

Écart constaté en conditions réelles : la documentation d'exploitation indiquait de
poser les secrets dans un `.env`, ce que Docker Compose lit nativement — mais en
développement local (`uvicorn app.main:app`), **rien** ne lisait ce fichier. La
procédure documentée ne marchait qu'à moitié, et le job de sauvegarde chiffrée
signalait une clé absente alors qu'elle était bien renseignée.
"""

import os

from app import config_env


def test_charge_les_variables_absentes_de_l_environnement(tmp_path, monkeypatch):
    fichier = tmp_path / ".env"
    fichier.write_text("PATRIMOINE_TEST_NOUVELLE=valeur-du-fichier\n", encoding="utf-8")
    monkeypatch.setattr(config_env, "CHEMIN_ENV", fichier)
    monkeypatch.delenv("PATRIMOINE_TEST_NOUVELLE", raising=False)

    assert config_env.charger_env() is True
    assert os.environ["PATRIMOINE_TEST_NOUVELLE"] == "valeur-du-fichier"


def test_n_ecrase_jamais_une_variable_deja_definie(tmp_path, monkeypatch):
    """LA garantie qui compte, et elle protège cette suite elle-même.

    `conftest.py` positionne `PATRIMOINE_DB` vers une base jetable avant tout import
    de l'application. Si le `.env` du poste de développement pouvait l'écraser, la
    suite de tests travaillerait sur la VRAIE base de l'utilisateur — des milliers
    de lignes réelles détruites par un `db.query(...).delete()` de fixture.

    Même raisonnement en conteneur : les valeurs injectées par l'orchestrateur font
    foi sur un fichier qui traînerait dans l'image."""
    fichier = tmp_path / ".env"
    fichier.write_text("PATRIMOINE_TEST_EXISTANTE=valeur-du-fichier\n", encoding="utf-8")
    monkeypatch.setattr(config_env, "CHEMIN_ENV", fichier)
    monkeypatch.setenv("PATRIMOINE_TEST_EXISTANTE", "valeur-de-l-environnement")

    config_env.charger_env()

    assert os.environ["PATRIMOINE_TEST_EXISTANTE"] == "valeur-de-l-environnement"


def test_l_absence_de_fichier_n_est_pas_une_erreur(tmp_path, monkeypatch):
    """Cas normal d'un déploiement où les variables viennent de l'orchestrateur :
    l'absence de `.env` ne doit jamais empêcher l'application de démarrer."""
    monkeypatch.setattr(config_env, "CHEMIN_ENV", tmp_path / "inexistant.env")

    assert config_env.charger_env() is False


def test_ne_revele_jamais_les_valeurs(tmp_path, monkeypatch):
    """`variables_chargees` alimente le journal de démarrage : elle doit permettre de
    constater QU'une clé est en place sans jamais l'écrire dans un log."""
    monkeypatch.setenv("PATRIMOINE_TEST_SECRET", "valeur-tres-secrete")

    noms = config_env.variables_chargees()

    assert "PATRIMOINE_TEST_SECRET" in noms
    assert all("valeur-tres-secrete" not in n for n in noms)
