"""Export et import de TOUTES les données d'un foyer (backlog X.6).

Complémentaire, et volontairement distinct, des deux mécanismes existants :

- `services/backup_service.py` sauvegarde le FICHIER SQLite entier, chiffré, côté
  serveur, pour l'exploitant — opaque, non ré-importable ailleurs, et contenant
  tous les foyers ;
- `services/csv_export.py` produit des extraits thématiques à lire dans Excel —
  lisibles mais partiels et non ré-importables (les relations sont aplaties).

Ici : un JSON complet, portable et ré-importable, du patrimoine d'UN foyer — pour
migrer d'instance, se faire une sauvegarde avant manipulation, ou repartir d'une
machine neuve.

**Périmètre** (décidé avec l'utilisateur le 02/09/2026) : tout ce que l'utilisateur
a saisi, y compris le budget. Sont exclus, délibérément :

- les CACHES reconstructibles (`market_data_cache`, `fund_composition*`,
  `fund_top_holdings`, `ticker_resolution`, `historique_cache`) — ils se
  régénèrent seuls au premier rafraîchissement, et alourdiraient le fichier sans
  rien apporter ;
- tout ce qui est SENSIBLE ou propre à l'instance : `users` (hachages de mots de
  passe), `auth_tokens`, `access_log_entries`, `liens_partage`/`partage_acces`
  (jetons de partage), `perimetres_invites`, `scheduled_job_config`, `parametres`
  (réglages globaux du serveur, pas du foyer).

**Import = remplacement total** (décision utilisateur) : tout le patrimoine du
foyer est effacé puis reconstruit depuis le fichier. Pas de fusion — un « PEA »
déjà présent poserait une question d'identité (doublon ? fusion ? écrasement ?)
sans réponse évidente. Le remplacement, lui, est prévisible : après import, le
foyer contient exactement le contenu du fichier.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Any

from sqlalchemy.orm import Session

from ..models import (
    ORIGINE_MANUEL,
    ORIGINE_RECONSTRUIT,
    TYPES_DETENTEUR_VALIDES,
    TYPES_OBJECTIF,
    BudgetCible,
    CategorieBudget,
    Compte,
    Detenteur,
    Etablissement,
    Holding,
    HoldingImmobilierDetail,
    HoldingValuationHistory,
    Loan,
    MouvementBancaire,
    Objectif,
    ObjectifActif,
    ObjectifContributeur,
    QuotiteHolding,
    QuotiteLoan,
    RegleCategorisation,
    Salaire,
    Transaction,
    UserParametre,
)
from . import salaire_service

logger = logging.getLogger("patrimoine.donnees_service")

FORMAT = "patrimoine-export"
# Incrémenter à tout changement NON rétrocompatible du contenu exporté (colonne
# retirée, sémantique changée). L'ajout d'une table ou d'une colonne optionnelle
# reste compatible : `_importer_table` ignore les colonnes inconnues et laisse les
# colonnes absentes à leur défaut.
VERSION = 1


class FichierExportInvalideError(ValueError):
    """Fichier non reconnu comme un export de cette application, ou produit par une
    version incompatible."""


@dataclass(frozen=True)
class TableExportee:
    """Déclaration d'une table à exporter/importer.

    `references` : colonne -> nom de la table cible, pour réécrire les
    identifiants à l'import (les ids du fichier viennent d'une AUTRE base et ne
    doivent jamais être réutilisés tels quels).

    `scope_par` : pour les tables sans `user_id` (filles), la référence par
    laquelle on retrouve les lignes du foyer — leur appartenance se déduit de leur
    parent, jamais d'une colonne propre.
    """

    nom: str
    modele: type
    references: dict[str, str] = field(default_factory=dict)
    scope_par: str | None = None
    # Colonnes « énumération » dont la valeur doit appartenir à un ensemble fermé.
    # L'import écrit les lignes directement (`modele(**valeurs)`), sans passer par
    # les schémas Pydantic qui valident ces champs sur les routes normales : sans ce
    # garde-fou, un fichier d'export édité à la main injecte n'importe quoi, et le
    # schéma ne porte aucune contrainte CHECK pour le rattraper (revue du
    # 03/09/2026). Le foyer n'est pas franchissable pour autant — `user_id` est
    # forcé et `users` n'est pas importable — mais l'utilisateur peut corrompre ses
    # PROPRES données et casser un écran sans comprendre pourquoi.
    valeurs_autorisees: dict[str, frozenset[str]] = field(default_factory=dict)

    @property
    def a_un_id(self) -> bool:
        """`user_parametres` a une clé primaire composite (`cle`, `user_id`) et pas
        d'`id` de substitution : rien à remapper pour elle, et rien à collecter
        comme parent — aucune table ne la référence."""
        return "id" in self.modele.__table__.columns


# Ordre = ordre d'INSERTION à l'import : un parent précède toujours ses enfants.
# La suppression parcourt cette liste à l'envers, pour la même raison.
TABLES: list[TableExportee] = [
    TableExportee("etablissements", Etablissement),
    TableExportee("comptes", Compte, references={"etablissement_id": "etablissements"}),
    TableExportee("detenteurs", Detenteur, valeurs_autorisees={"type": frozenset(TYPES_DETENTEUR_VALIDES)}),
    TableExportee(
        "holdings",
        Holding,
        references={"compte_id": "comptes"},
        valeurs_autorisees={"origine": frozenset({ORIGINE_MANUEL, ORIGINE_RECONSTRUIT})},
    ),
    TableExportee("holding_immobilier_details", HoldingImmobilierDetail, references={"holding_id": "holdings"}, scope_par="holding_id"),
    TableExportee("holding_valuation_history", HoldingValuationHistory, references={"holding_id": "holdings"}, scope_par="holding_id"),
    TableExportee(
        "quotites_holdings",
        QuotiteHolding,
        references={"holding_id": "holdings", "detenteur_id": "detenteurs"},
        scope_par="holding_id",
    ),
    TableExportee("loans", Loan, references={"holding_id": "holdings"}),
    TableExportee(
        "quotites_loans",
        QuotiteLoan,
        references={"loan_id": "loans", "detenteur_id": "detenteurs"},
        scope_par="loan_id",
    ),
    TableExportee("transactions", Transaction),
    TableExportee(
        "salaires",
        Salaire,
        valeurs_autorisees={
            "periodicite": frozenset(salaire_service.PERIODICITES_VALIDES),
            "statut": frozenset(salaire_service.STATUTS_VALIDES),
        },
    ),
    TableExportee("objectifs", Objectif, valeurs_autorisees={"type": frozenset(TYPES_OBJECTIF)}),
    TableExportee(
        "objectif_actifs",
        ObjectifActif,
        references={"objectif_id": "objectifs", "holding_id": "holdings"},
        scope_par="objectif_id",
    ),
    TableExportee(
        "objectif_contributeurs",
        ObjectifContributeur,
        references={"objectif_id": "objectifs", "detenteur_id": "detenteurs"},
        scope_par="objectif_id",
    ),
    # `parent_id` est auto-référent (sous-catégories) : l'import fait deux passes,
    # cf. `_importer_table`.
    TableExportee("categories_budget", CategorieBudget, references={"parent_id": "categories_budget"}),
    TableExportee("mouvements_bancaires", MouvementBancaire, references={"categorie_id": "categories_budget"}),
    TableExportee("regles_categorisation", RegleCategorisation, references={"categorie_id": "categories_budget"}),
    TableExportee("budget_cibles", BudgetCible, references={"categorie_id": "categories_budget"}),
    TableExportee("user_parametres", UserParametre),
]

# Colonnes jamais exportées : `user_id` est celui du foyer SOURCE (l'import le
# repositionne sur le foyer courant), `id` est conservé à part pour le remappage.
COLONNES_EXCLUES = {"user_id"}


def _colonnes(table: TableExportee) -> list[str]:
    return [c.name for c in table.modele.__table__.columns if c.name not in COLONNES_EXCLUES]


def _serialiser(valeur: Any) -> Any:
    if isinstance(valeur, datetime | date):
        return valeur.isoformat()
    return valeur


def _lignes_du_foyer(db: Session, table: TableExportee, user_id: int, ids_parents: dict[str, set[int]]) -> list:
    modele = table.modele
    if table.scope_par is None:
        return db.query(modele).filter(modele.user_id == user_id).all()
    # Table fille : son appartenance au foyer se déduit du parent déjà collecté.
    table_parent = table.references[table.scope_par]
    ids = ids_parents.get(table_parent, set())
    if not ids:
        return []
    return db.query(modele).filter(getattr(modele, table.scope_par).in_(ids)).all()


def exporter_foyer(db: Session, user_id: int) -> dict:
    """Construit le document JSON complet du foyer. Les identifiants d'origine sont
    conservés tels quels : ils ne servent qu'à relier les tables entre elles dans
    le fichier, et sont réécrits à l'import."""
    donnees: dict[str, list[dict]] = {}
    ids_parents: dict[str, set[int]] = {}

    for table in TABLES:
        lignes = _lignes_du_foyer(db, table, user_id, ids_parents)
        ids_parents[table.nom] = {ligne.id for ligne in lignes} if table.a_un_id else set()
        colonnes = _colonnes(table)
        donnees[table.nom] = [{col: _serialiser(getattr(ligne, col)) for col in colonnes} for ligne in lignes]

    return {
        "format": FORMAT,
        "version": VERSION,
        "exporte_le": datetime.now().isoformat(),
        "donnees": donnees,
    }


def resume(document: dict) -> dict[str, int]:
    """Décompte par table — sert à la fois au retour d'export et à l'écran de
    confirmation avant import (« voici ce que contient ce fichier »)."""
    donnees = document.get("donnees", {})
    return {table.nom: len(donnees.get(table.nom, [])) for table in TABLES if donnees.get(table.nom)}


def valider(document: Any) -> None:
    """Rejette tout ce qui n'est pas un export de cette application AVANT de
    toucher à la base : un fichier étranger ne doit jamais pouvoir déclencher
    l'effacement du foyer."""
    if not isinstance(document, dict):
        raise FichierExportInvalideError("Le fichier n'est pas un export de patrimoine (JSON attendu).")
    if document.get("format") != FORMAT:
        raise FichierExportInvalideError("Ce fichier n'est pas un export de cette application.")
    version = document.get("version")
    if version != VERSION:
        raise FichierExportInvalideError(
            f"Export en version {version}, incompatible avec cette application (version {VERSION} attendue)."
        )
    if not isinstance(document.get("donnees"), dict):
        raise FichierExportInvalideError("Le fichier est un export de patrimoine, mais son contenu est illisible.")


def _valeur_a_inserer(colonne: str, valeur: Any, modele: type) -> Any:
    """Reconvertit les dates ISO en `datetime`/`date` selon le type déclaré par le
    modèle — `json.loads` ne rend que des chaînes."""
    if valeur is None:
        return None
    type_python = getattr(modele.__table__.columns[colonne].type, "python_type", None)
    try:
        cible = type_python
    except NotImplementedError:  # pragma: no cover - types sans python_type
        return valeur
    if cible is datetime and isinstance(valeur, str):
        return datetime.fromisoformat(valeur)
    if cible is date and isinstance(valeur, str):
        return date.fromisoformat(valeur)
    return valeur


def _supprimer_donnees_du_foyer(db: Session, user_id: int) -> None:
    """Efface tout le patrimoine du foyer, enfants avant parents. Les caches et les
    données sensibles (cf. docstring de module) ne sont jamais touchés."""
    ids_parents: dict[str, set[int]] = {}
    for table in TABLES:
        lignes = _lignes_du_foyer(db, table, user_id, ids_parents)
        ids_parents[table.nom] = {ligne.id for ligne in lignes} if table.a_un_id else set()

    for table in reversed(TABLES):
        modele = table.modele
        if table.scope_par is None:
            db.query(modele).filter(modele.user_id == user_id).delete(synchronize_session=False)
        else:
            ids = ids_parents.get(table.references[table.scope_par], set())
            if ids:
                db.query(modele).filter(getattr(modele, table.scope_par).in_(ids)).delete(synchronize_session=False)
    db.flush()


class ValeurInvalideError(ValueError):
    """Une colonne « énumération » porte une valeur hors de son ensemble autorisé."""


def _verifier_valeur_autorisee(table: TableExportee, colonne: str, valeur: Any) -> None:
    autorisees = table.valeurs_autorisees.get(colonne)
    if autorisees is None or valeur is None:
        return
    if valeur not in autorisees:
        attendues = ", ".join(sorted(autorisees))
        raise ValeurInvalideError(
            f"Valeur invalide pour {table.nom}.{colonne} : « {valeur} ». Attendu l'une de : {attendues}."
        )


def _importer_table(db: Session, table: TableExportee, lignes: list[dict], user_id: int, remap: dict[str, dict[int, int]]) -> None:
    colonnes = set(_colonnes(table))
    modele = table.modele
    remap_table: dict[int, int] = {}
    # Auto-référence (`categories_budget.parent_id`) : on insère d'abord les lignes
    # sans parent, puis les autres — sinon `parent_id` pointerait vers un id pas
    # encore réécrit. Deux passes suffisent tant que la hiérarchie n'a qu'un niveau,
    # ce que l'interface Budget est seule à créer ; une hiérarchie plus profonde
    # verrait ses niveaux au-delà du second rattachés à la racine plutôt que
    # d'échouer (dégradation choisie, jamais une erreur d'import).
    auto_ref = [col for col, cible in table.references.items() if cible == table.nom]
    passes = [
        [ligne for ligne in lignes if all(ligne.get(col) is None for col in auto_ref)],
        [ligne for ligne in lignes if any(ligne.get(col) is not None for col in auto_ref)],
    ] if auto_ref else [lignes]

    for lot in passes:
        for ligne in lot:
            ancien_id = ligne.get("id")
            valeurs: dict[str, Any] = {}
            for colonne, valeur in ligne.items():
                if colonne == "id" or colonne not in colonnes:
                    continue  # colonne inconnue (export d'une autre version) : ignorée
                if colonne in table.references:
                    table_cible = table.references[colonne]
                    valeurs[colonne] = remap.get(table_cible, {}).get(valeur) if valeur is not None else None
                else:
                    valeurs[colonne] = _valeur_a_inserer(colonne, valeur, modele)
                    _verifier_valeur_autorisee(table, colonne, valeurs[colonne])
            if hasattr(modele, "user_id"):
                valeurs["user_id"] = user_id
            objet = modele(**valeurs)
            db.add(objet)
            db.flush()  # rend le nouvel id disponible pour les tables filles
            if table.a_un_id and ancien_id is not None:
                remap_table[ancien_id] = objet.id
    remap[table.nom] = remap_table


def importer_foyer(db: Session, user_id: int, document: Any) -> dict[str, int]:
    """Remplace intégralement le patrimoine du foyer par le contenu du document.

    Tout ou rien : la moindre erreur annule l'ensemble (`rollback`), le foyer
    reste dans son état d'avant l'import — un import à moitié appliqué serait pire
    que pas d'import du tout, puisqu'il aurait déjà effacé l'existant.
    """
    valider(document)
    donnees = document["donnees"]

    try:
        _supprimer_donnees_du_foyer(db, user_id)
        remap: dict[str, dict[int, int]] = {}
        for table in TABLES:
            _importer_table(db, table, donnees.get(table.nom, []), user_id, remap)
        db.commit()
    except Exception:
        db.rollback()
        logger.exception("import de données annulé (foyer %s)", user_id)
        raise

    compte = resume(document)
    logger.info("import de données terminé (foyer %s) : %s", user_id, compte)
    return compte
