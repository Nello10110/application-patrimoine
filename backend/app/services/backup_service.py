"""Sauvegarde chiffrée planifiée (backlog 2.L.2) : encapsule `scripts/sauvegarde.py`
(non modifié — reste autonome, testable indépendamment de `app`, et toujours
utilisable tel quel en CLI pour une sauvegarde manuelle NON chiffrée) pour brancher
une sauvegarde + chiffrement Fernet dans le scheduler applicatif (`scheduler_service.py`).

Chiffrement symétrique via `cryptography.fernet.Fernet` (AES-128-CBC + HMAC,
implémentation simple à utiliser correctement) plutôt qu'une primitive stdlib : il
n'existe pas d'équivalent stdlib raisonnable pour du chiffrement symétrique moderne
(contrairement au hachage de mot de passe ou aux jetons opaques déjà en place ici
sans dépendance externe)."""

from __future__ import annotations

import logging
import os
import tempfile
from pathlib import Path

from cryptography.fernet import Fernet

from scripts import sauvegarde as sauvegarde_module

logger = logging.getLogger("patrimoine.backup_service")

VARIABLE_CLE = "PATRIMOINE_BACKUP_KEY"
SUFFIXE_CHIFFRE = ".enc"


class CleChiffrementAbsenteError(RuntimeError):
    """La variable d'environnement `PATRIMOINE_BACKUP_KEY` n'est pas définie —
    cf. `docs/MANUEL_EXPLOITATION.md` pour la génération et le déploiement de la clé."""


def _fernet() -> Fernet:
    cle = os.environ.get(VARIABLE_CLE)
    if not cle:
        raise CleChiffrementAbsenteError(f"{VARIABLE_CLE} non définie — voir docs/MANUEL_EXPLOITATION.md")
    return Fernet(cle.encode("utf-8"))


def sauvegarder_chiffre(chemin_source: Path, dossier_destination: Path, *, horodatage=None) -> Path:
    """Vérifie la clé de chiffrement AVANT toute écriture (jamais de sauvegarde en
    clair laissée sur disque si la clé manque). Réutilise `sauvegarde.sauvegarder`
    (qui vérifie déjà l'intégrité du fichier clair) puis chiffre, et supprime le
    clair dans un `finally` — même en cas d'échec du chiffrement lui-même."""
    fernet = _fernet()
    chemin_clair = sauvegarde_module.sauvegarder(chemin_source, dossier_destination, horodatage=horodatage)
    try:
        chemin_chiffre = chemin_clair.with_name(chemin_clair.name + SUFFIXE_CHIFFRE)
        chemin_chiffre.write_bytes(fernet.encrypt(chemin_clair.read_bytes()))
    finally:
        chemin_clair.unlink(missing_ok=True)
    logger.info("sauvegarde chiffrée créée : %s", chemin_chiffre)
    return chemin_chiffre


def dechiffrer(chemin_chiffre: Path, chemin_clair_destination: Path) -> Path:
    """Lève `CleChiffrementAbsenteError` si la clé manque, `InvalidToken` (de
    `cryptography`) si la clé est incorrecte ou le fichier corrompu."""
    fernet = _fernet()
    chemin_chiffre = Path(chemin_chiffre)
    chemin_clair_destination = Path(chemin_clair_destination)
    chemin_clair_destination.parent.mkdir(parents=True, exist_ok=True)
    chemin_clair_destination.write_bytes(fernet.decrypt(chemin_chiffre.read_bytes()))
    return chemin_clair_destination


def lister_sauvegardes_chiffrees(dossier: Path) -> list[Path]:
    dossier = Path(dossier)
    if not dossier.exists():
        return []
    fichiers = [
        f for f in dossier.iterdir() if f.is_file() and sauvegarde_module._MOTIF_NOM_SAUVEGARDE.match(f.name.removesuffix(SUFFIXE_CHIFFRE))
    ]
    return sorted(fichiers)


def appliquer_retention_chiffree(dossier: Path, retention: int = sauvegarde_module.RETENTION_PAR_DEFAUT) -> list[Path]:
    """Même politique que `sauvegarde.appliquer_retention` (ne garde que les
    `retention` plus récentes), appliquée aux fichiers `.db.enc` plutôt qu'aux
    `.db` en clair."""
    if retention <= 0:
        return []
    fichiers = lister_sauvegardes_chiffrees(dossier)
    if len(fichiers) <= retention:
        return []
    a_supprimer = fichiers[: len(fichiers) - retention]
    for fichier in a_supprimer:
        fichier.unlink()
        logger.info("sauvegarde chiffrée supprimée (rétention à %d) : %s", retention, fichier)
    return a_supprimer


def restaurer_chiffre(chemin_chiffre: Path, chemin_base_cible: Path, dossier_sauvegardes: Path) -> Path:
    """Déchiffre `chemin_chiffre` vers un fichier temporaire puis délègue à
    `sauvegarde.restaurer` (garde ainsi la mise de côté de la base courante déjà
    gérée là-bas) ; nettoie le fichier temporaire déchiffré dans tous les cas."""
    with tempfile.TemporaryDirectory() as dossier_temp:
        chemin_clair_temp = Path(dossier_temp) / Path(chemin_chiffre).name.removesuffix(SUFFIXE_CHIFFRE)
        dechiffrer(chemin_chiffre, chemin_clair_temp)
        return sauvegarde_module.restaurer(chemin_clair_temp, chemin_base_cible, dossier_sauvegardes)
