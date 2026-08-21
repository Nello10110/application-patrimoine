"""Verrouille `services/backup_service.py` (backlog 2.L.2) : chiffrement/déchiffrement,
absence de clé, rétention, restauration — sans passer par le scheduler
(`test_scheduler_service.py` s'en charge)."""

import sqlite3

import pytest
from cryptography.fernet import Fernet, InvalidToken

from app.services import backup_service


@pytest.fixture
def cle_chiffrement(monkeypatch):
    cle = Fernet.generate_key().decode("utf-8")
    monkeypatch.setenv(backup_service.VARIABLE_CLE, cle)
    return cle


@pytest.fixture
def base_source(tmp_path):
    chemin = tmp_path / "patrimoine.db"
    connexion = sqlite3.connect(str(chemin))
    connexion.execute("CREATE TABLE holdings (id INTEGER PRIMARY KEY)")
    connexion.execute("CREATE TABLE transactions (id INTEGER PRIMARY KEY)")
    connexion.execute("CREATE TABLE market_data_cache (id INTEGER PRIMARY KEY)")
    connexion.execute("CREATE TABLE allocation_targets (id INTEGER PRIMARY KEY)")
    connexion.commit()
    connexion.close()
    return chemin


def test_sauvegarder_chiffre_sans_cle_leve_et_ne_laisse_rien(base_source, tmp_path, monkeypatch):
    monkeypatch.delenv(backup_service.VARIABLE_CLE, raising=False)
    dossier = tmp_path / "sauvegardes"

    with pytest.raises(backup_service.CleChiffrementAbsenteError):
        backup_service.sauvegarder_chiffre(base_source, dossier)

    # Aucun fichier, ni en clair ni chiffré, ne doit avoir été laissé sur disque.
    assert not dossier.exists() or list(dossier.iterdir()) == []


def test_sauvegarder_puis_dechiffrer_round_trip(base_source, tmp_path, cle_chiffrement):
    dossier = tmp_path / "sauvegardes"

    chemin_chiffre = backup_service.sauvegarder_chiffre(base_source, dossier)

    assert chemin_chiffre.exists()
    assert chemin_chiffre.name.endswith(".db.enc")
    # Le fichier chiffré n'est pas une base SQLite directement ouvrable.
    with pytest.raises(sqlite3.DatabaseError):
        sqlite3.connect(str(chemin_chiffre)).execute("SELECT 1 FROM holdings").fetchone()

    chemin_clair = tmp_path / "dechiffre.db"
    backup_service.dechiffrer(chemin_chiffre, chemin_clair)

    connexion = sqlite3.connect(str(chemin_clair))
    connexion.execute("SELECT COUNT(*) FROM holdings").fetchone()
    connexion.close()


def test_dechiffrer_avec_mauvaise_cle_leve_invalid_token(base_source, tmp_path, cle_chiffrement, monkeypatch):
    dossier = tmp_path / "sauvegardes"
    chemin_chiffre = backup_service.sauvegarder_chiffre(base_source, dossier)

    monkeypatch.setenv(backup_service.VARIABLE_CLE, Fernet.generate_key().decode("utf-8"))

    with pytest.raises(InvalidToken):
        backup_service.dechiffrer(chemin_chiffre, tmp_path / "dechiffre.db")


def test_appliquer_retention_chiffree_purge_les_plus_anciennes(base_source, tmp_path, cle_chiffrement):
    from datetime import datetime, timedelta

    dossier = tmp_path / "sauvegardes"
    horodatage = datetime(2026, 1, 1)
    for i in range(5):
        backup_service.sauvegarder_chiffre(base_source, dossier, horodatage=horodatage + timedelta(days=i))

    supprimees = backup_service.appliquer_retention_chiffree(dossier, retention=3)

    restantes = backup_service.lister_sauvegardes_chiffrees(dossier)
    assert len(restantes) == 3
    assert len(supprimees) == 2


def test_restaurer_chiffre_round_trip(base_source, tmp_path, cle_chiffrement):
    dossier_sauvegardes = tmp_path / "sauvegardes"
    chemin_chiffre = backup_service.sauvegarder_chiffre(base_source, dossier_sauvegardes)

    cible = tmp_path / "restauree.db"
    backup_service.restaurer_chiffre(chemin_chiffre, cible, dossier_sauvegardes)

    connexion = sqlite3.connect(str(cible))
    connexion.execute("SELECT COUNT(*) FROM holdings").fetchone()
    connexion.close()
