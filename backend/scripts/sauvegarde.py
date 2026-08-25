#!/usr/bin/env python3
"""Sauvegarde et restauration de la base SQLite d'Application Patrimoine (LOT 7.6).

`patrimoine.db` contient l'intégralité de l'historique financier personnel de
l'utilisateur, sans sauvegarde automatique ni procédure de restauration testée
avant ce script (cf. BACKLOG.md, §7.6). Deux choix de conception découlent
directement de ce constat :

- **Sauvegarde à chaud via l'API native de SQLite** (`sqlite3.Connection.backup`),
  jamais une copie de fichier (`shutil.copy`, `cp`...) : l'application peut très
  bien tourner au moment de la sauvegarde (aucune procédure d'arrêt n'est exigée
  de l'utilisateur), et copier les octets d'un fichier SQLite pendant une écriture
  produit une base corrompue ou incohérente. `backup()` s'appuie sur les
  mécanismes internes de SQLite (verrouillage, pages en cours d'écriture) pour
  produire une copie cohérente même base ouverte ailleurs.
- **Vérification post-sauvegarde systématique** (`PRAGMA integrity_check` + lecture
  des tables principales) : ne jamais annoncer un succès sur un fichier que
  l'application serait ensuite incapable de relire. Une sauvegarde qu'on ne sait
  pas restaurer n'a aucune valeur ; ce script est donc volontairement testé (cf.
  `tests/test_sauvegarde.py`) aussi bien à la création qu'à la restauration.

Le script est utilisable en ligne de commande (`python scripts/sauvegarde.py
--help`) et ses fonctions publiques (`sauvegarder`, `restaurer`,
`appliquer_retention`, `verifier_integrite`) sont testables indépendamment de
l'interface en ligne de commande.

Volontairement autonome (ne dépend que de la bibliothèque standard, pas du
paquet `app`) : ce script doit pouvoir tourner même si l'application elle-même
ne démarre plus (base corrompue, dépendance cassée...), et fonctionner qu'il
soit lancé directement (`python scripts/sauvegarde.py`) ou importé depuis les
tests (`from scripts.sauvegarde import ...`). Il respecte néanmoins la même
variable d'environnement `PATRIMOINE_DB` que `app/database.py` pour repérer la
base source, avec le même chemin par défaut (`backend/patrimoine.db`).
"""

from __future__ import annotations

import argparse
import logging
import os
import re
import sqlite3
from datetime import datetime
from pathlib import Path

logger = logging.getLogger("patrimoine.sauvegarde")

# Tables dont l'absence ou l'illisibilité, après copie, signale à coup sûr une
# sauvegarde inexploitable — sans prétendre à l'exhaustivité de tout le schéma
# (`PRAGMA integrity_check` couvre déjà la cohérence bas niveau des pages/index).
TABLES_PRINCIPALES = ("holdings", "transactions", "market_data_cache")

RETENTION_PAR_DEFAUT = 10

_RACINE_BACKEND = Path(__file__).resolve().parent.parent
_CHEMIN_BASE_PAR_DEFAUT = _RACINE_BACKEND / "patrimoine.db"
DOSSIER_SAUVEGARDES_PAR_DEFAUT = _RACINE_BACKEND / "sauvegardes"

_FORMAT_HORODATAGE = "%Y%m%d-%H%M%S"
# Une sauvegarde normale : "portfolio-AAAAMMJJ-HHMMSS.db", avec un suffixe "-2",
# "-3"... en cas de collision (deux sauvegardes lancées dans la même seconde).
# Distinct par construction du nom des copies de sécurité créées par `restaurer`
# ("patrimoine-avant-restauration-...") : `appliquer_retention` ne doit jamais
# purger ces dernières, qui ne sont pas des sauvegardes périodiques.
_MOTIF_NOM_SAUVEGARDE = re.compile(r"^patrimoine-\d{8}-\d{6}(-\d+)?\.db$")


class SauvegardeInvalideError(RuntimeError):
    """Levée quand une base (fraîchement sauvegardée ou fournie pour restauration)
    échoue au contrôle d'intégrité — ne doit jamais être confondue avec un succès
    silencieux."""


def chemin_base_source() -> Path:
    """Chemin de la base SQLite source, piloté par `PATRIMOINE_DB` comme le
    reste de l'application (`app/database.py`) ; à défaut, l'emplacement
    historique `backend/patrimoine.db`."""
    valeur = os.environ.get("PATRIMOINE_DB")
    return Path(valeur) if valeur else _CHEMIN_BASE_PAR_DEFAUT


def _copier_via_api_sauvegarde_sqlite(source: Path, destination: Path) -> None:
    """Copie cohérente d'une base SQLite vers une autre via l'API de sauvegarde
    native (`sqlite3.Connection.backup`), jamais une copie de fichier — cf.
    docstring de module. `destination` est créée si elle n'existe pas encore."""
    destination.parent.mkdir(parents=True, exist_ok=True)
    connexion_source = sqlite3.connect(str(source))
    connexion_destination = sqlite3.connect(str(destination))
    try:
        with connexion_destination:
            connexion_source.backup(connexion_destination)
    finally:
        connexion_source.close()
        connexion_destination.close()


def verifier_integrite(chemin_base: Path) -> None:
    """Rouvre `chemin_base` (une sauvegarde fraîchement créée, ou un fichier fourni
    pour restauration) et vérifie qu'elle est lisible et cohérente : `PRAGMA
    integrity_check` (détecte page corrompue, index cassé...) puis lecture des
    tables principales (une base tronquée en cours de copie pourrait en théorie
    passer l'`integrity_check` tout en étant vide ou incomplète). Lève
    `SauvegardeInvalideError` sinon — jamais d'échec silencieux."""
    if not chemin_base.exists():
        raise FileNotFoundError(f"Fichier introuvable : {chemin_base}")

    try:
        connexion = sqlite3.connect(str(chemin_base))
    except sqlite3.Error as exc:
        raise SauvegardeInvalideError(f"impossible d'ouvrir {chemin_base} : {exc}") from exc

    try:
        try:
            resultat = connexion.execute("PRAGMA integrity_check").fetchone()
        except sqlite3.DatabaseError as exc:
            raise SauvegardeInvalideError(f"{chemin_base} n'est pas une base SQLite valide : {exc}") from exc
        if resultat is None or resultat[0] != "ok":
            raise SauvegardeInvalideError(f"contrôle d'intégrité échoué sur {chemin_base} : {resultat}")

        tables_presentes = {
            ligne[0] for ligne in connexion.execute("SELECT name FROM sqlite_master WHERE type = 'table'").fetchall()
        }
        for table in TABLES_PRINCIPALES:
            if table not in tables_presentes:
                raise SauvegardeInvalideError(f"table attendue absente de {chemin_base} : {table}")
            try:
                connexion.execute(f'SELECT COUNT(*) FROM "{table}"').fetchone()
            except sqlite3.DatabaseError as exc:
                raise SauvegardeInvalideError(f"table {table} illisible dans {chemin_base} : {exc}") from exc
    finally:
        connexion.close()

    logger.info("contrôle d'intégrité OK : %s", chemin_base)


def _nom_disponible(dossier: Path, prefixe_horodate: str) -> Path:
    """Premier chemin `dossier / (prefixe_horodate + ".db")` libre, avec un
    suffixe `-2`, `-3`... en cas de collision (deux appels dans la même seconde,
    résolution de l'horodatage étant à la seconde près)."""
    chemin = dossier / f"{prefixe_horodate}.db"
    compteur = 2
    while chemin.exists():
        chemin = dossier / f"{prefixe_horodate}-{compteur}.db"
        compteur += 1
    return chemin


def sauvegarder(chemin_source: Path, dossier_destination: Path, *, horodatage: datetime | None = None) -> Path:
    """Sauvegarde cohérente à chaud de `chemin_source` vers un fichier horodaté de
    `dossier_destination` (créé si besoin), via l'API de sauvegarde SQLite. Vérifie
    l'intégrité de la copie avant de renvoyer son chemin.

    `horodatage`, normalement `datetime.now()`, est paramétrable pour les tests
    (produire des sauvegardes à des dates distinctes sans dépendre du temps réel).

    Lève `FileNotFoundError` si `chemin_source` n'existe pas, `SauvegardeInvalideError`
    si la copie obtenue échoue au contrôle d'intégrité."""
    chemin_source = Path(chemin_source)
    if not chemin_source.exists():
        raise FileNotFoundError(f"Base source introuvable : {chemin_source}")

    dossier_destination = Path(dossier_destination)
    dossier_destination.mkdir(parents=True, exist_ok=True)

    horodatage = horodatage or datetime.now()
    chemin_destination = _nom_disponible(dossier_destination, f"patrimoine-{horodatage.strftime(_FORMAT_HORODATAGE)}")

    _copier_via_api_sauvegarde_sqlite(chemin_source, chemin_destination)
    verifier_integrite(chemin_destination)

    logger.info("sauvegarde créée : %s", chemin_destination)
    return chemin_destination


def lister_sauvegardes(dossier: Path) -> list[Path]:
    """Sauvegardes périodiques présentes dans `dossier` (motif `patrimoine-
    AAAAMMJJ-HHMMSS[-N].db` uniquement — exclut les copies de sécurité créées par
    `restaurer`), triées de la plus ancienne à la plus récente. Le tri lexical sur
    le nom de fichier suffit : le format d'horodatage `AAAAMMJJ-HHMMSS` est
    intrinsèquement croissant dans le temps."""
    dossier = Path(dossier)
    if not dossier.exists():
        return []
    fichiers = [f for f in dossier.iterdir() if f.is_file() and _MOTIF_NOM_SAUVEGARDE.match(f.name)]
    return sorted(fichiers)


def appliquer_retention(dossier: Path, retention: int = RETENTION_PAR_DEFAUT) -> list[Path]:
    """Ne conserve que les `retention` sauvegardes périodiques les plus récentes de
    `dossier` ; supprime les plus anciennes et journalise chaque suppression.
    Renvoie la liste des fichiers supprimés.

    `retention <= 0` ne supprime rien : on ne veut jamais purger silencieusement
    tout un dossier de sauvegardes sur une valeur nulle ou négative passée par
    erreur — désactiver la rétention est une décision qui doit être explicite,
    pas un effet de bord d'une valeur mal saisie."""
    if retention <= 0:
        return []

    fichiers = lister_sauvegardes(dossier)
    if len(fichiers) <= retention:
        return []

    a_supprimer = fichiers[: len(fichiers) - retention]
    for fichier in a_supprimer:
        fichier.unlink()
        logger.info("sauvegarde supprimée (rétention à %d) : %s", retention, fichier)
    return a_supprimer


def restaurer(
    chemin_fichier_sauvegarde: Path,
    chemin_base_cible: Path,
    dossier_sauvegardes: Path,
    *,
    horodatage: datetime | None = None,
) -> Path:
    """Restaure `chemin_fichier_sauvegarde` vers `chemin_base_cible`.

    Vérifie d'abord l'intégrité du fichier à restaurer — avant de toucher à quoi
    que ce soit — puis, si `chemin_base_cible` existe déjà, la met de côté dans
    `dossier_sauvegardes` sous un nom horodaté distinct des sauvegardes
    périodiques (`patrimoine-avant-restauration-AAAAMMJJ-HHMMSS.db`), pour ne
    jamais perdre les dernières données en cas de restauration déclenchée par
    erreur. La copie de côté comme la restauration elle-même utilisent l'API de
    sauvegarde SQLite, pas une copie de fichier brute.

    Lève `FileNotFoundError` si `chemin_fichier_sauvegarde` n'existe pas,
    `SauvegardeInvalideError` si son contrôle d'intégrité échoue. Renvoie
    `chemin_base_cible`."""
    chemin_fichier_sauvegarde = Path(chemin_fichier_sauvegarde)
    chemin_base_cible = Path(chemin_base_cible)
    dossier_sauvegardes = Path(dossier_sauvegardes)

    if not chemin_fichier_sauvegarde.exists():
        raise FileNotFoundError(f"Fichier de sauvegarde introuvable : {chemin_fichier_sauvegarde}")

    verifier_integrite(chemin_fichier_sauvegarde)

    if chemin_base_cible.exists():
        dossier_sauvegardes.mkdir(parents=True, exist_ok=True)
        horodatage = horodatage or datetime.now()
        chemin_mise_de_cote = _nom_disponible(
            dossier_sauvegardes, f"patrimoine-avant-restauration-{horodatage.strftime(_FORMAT_HORODATAGE)}"
        )
        _copier_via_api_sauvegarde_sqlite(chemin_base_cible, chemin_mise_de_cote)
        logger.info("base courante mise de côté avant restauration : %s", chemin_mise_de_cote)

    _copier_via_api_sauvegarde_sqlite(chemin_fichier_sauvegarde, chemin_base_cible)
    logger.info("base restaurée : %s -> %s", chemin_fichier_sauvegarde, chemin_base_cible)
    return chemin_base_cible


def _construire_analyseur() -> argparse.ArgumentParser:
    analyseur = argparse.ArgumentParser(
        prog="sauvegarde.py",
        description=(
            "Sauvegarde et restauration de la base SQLite d'Application Patrimoine. Sans "
            "--restaurer, effectue une sauvegarde à chaud (cohérente même "
            "application démarrée) puis applique la rétention. Avec --restaurer, "
            "remplace la base courante par le fichier indiqué, après l'avoir "
            "mise de côté."
        ),
        epilog=(
            "Exemples :\n"
            "  python scripts/sauvegarde.py\n"
            "  python scripts/sauvegarde.py --dossier /mnt/sauvegardes --retention 30\n"
            "  python scripts/sauvegarde.py --restaurer sauvegardes/patrimoine-20260101-020000.db\n"
            "  python scripts/sauvegarde.py --restaurer sauvegardes/patrimoine-20260101-020000.db --forcer\n"
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    analyseur.add_argument(
        "--base",
        type=Path,
        default=None,
        metavar="CHEMIN",
        help="Chemin de la base SQLite source (sauvegarde) ou cible (restauration). "
        "Par défaut : $PATRIMOINE_DB si défini, sinon backend/patrimoine.db.",
    )
    analyseur.add_argument(
        "--dossier",
        type=Path,
        default=DOSSIER_SAUVEGARDES_PAR_DEFAUT,
        metavar="CHEMIN",
        help=f"Dossier de sauvegardes, créé s'il n'existe pas (défaut : {DOSSIER_SAUVEGARDES_PAR_DEFAUT}).",
    )
    analyseur.add_argument(
        "--retention",
        type=int,
        default=RETENTION_PAR_DEFAUT,
        metavar="N",
        help=f"Nombre de sauvegardes les plus récentes à conserver (défaut : {RETENTION_PAR_DEFAUT}). "
        "0 ou négatif désactive la suppression des anciennes sauvegardes. Sans effet avec --restaurer.",
    )
    analyseur.add_argument(
        "--restaurer",
        type=Path,
        default=None,
        metavar="FICHIER",
        help="Restaure la base depuis FICHIER au lieu d'effectuer une sauvegarde. "
        "La base courante est d'abord mise de côté dans --dossier.",
    )
    analyseur.add_argument(
        "--forcer",
        action="store_true",
        help="Avec --restaurer : ne pas demander de confirmation avant d'écraser la base courante.",
    )
    return analyseur


def _executer_sauvegarde(chemin_base: Path, dossier: Path, retention: int) -> int:
    try:
        chemin_sauvegarde = sauvegarder(chemin_base, dossier)
    except (FileNotFoundError, SauvegardeInvalideError) as exc:
        logger.error("échec de la sauvegarde : %s", exc)
        return 1

    supprimees = appliquer_retention(dossier, retention)
    print(f"Sauvegarde créée : {chemin_sauvegarde}")
    if supprimees:
        noms = ", ".join(f.name for f in supprimees)
        print(f"{len(supprimees)} ancienne(s) sauvegarde(s) supprimée(s) (rétention à {retention}) : {noms}")
    return 0


def _executer_restauration(fichier: Path, chemin_base: Path, dossier: Path, forcer: bool) -> int:
    if not forcer:
        reponse = input(
            f"Ceci va remplacer {chemin_base} par le contenu de {fichier}.\n"
            "La base courante sera d'abord mise de côté. Confirmer ? [o/N] "
        )
        if reponse.strip().lower() not in ("o", "oui", "y", "yes"):
            print("Restauration annulée.")
            return 1

    try:
        restaurer(fichier, chemin_base, dossier)
    except (FileNotFoundError, SauvegardeInvalideError) as exc:
        logger.error("échec de la restauration : %s", exc)
        return 1

    print(f"Base restaurée depuis {fichier} vers {chemin_base}.")
    return 0


def main(argv: list[str] | None = None) -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s", datefmt="%Y-%m-%d %H:%M:%S")

    args = _construire_analyseur().parse_args(argv)
    chemin_base = args.base or chemin_base_source()

    if args.restaurer is not None:
        return _executer_restauration(args.restaurer, chemin_base, args.dossier, args.forcer)
    return _executer_sauvegarde(chemin_base, args.dossier, args.retention)


if __name__ == "__main__":
    raise SystemExit(main())
