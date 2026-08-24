"""Arbre de catégories budget (backlog 2.N.1) et règles de catégorisation par
mot-clé — CRUD scopé par utilisateur, plus la logique de correspondance motif →
catégorie réutilisée à l'import (`budget_import_service.py`) et pour la
réapplication en masse."""

import unicodedata

from sqlalchemy.orm import Session

from ..models import BudgetCible, CategorieBudget, MouvementBancaire, RegleCategorisation
from . import preferences_service

# Arbre par défaut (backlog 2.N.1) : point de départ suggéré à la première visite de
# l'écran Budget/Import, jamais recréé une fois l'utilisateur passé par là (cf.
# `assurer_categories_par_defaut`) — entièrement modifiable ensuite, comme le texte
# du backlog l'exige.
DEFAULT_CATEGORIES = [
    "Logement",
    "Transport",
    "Alimentation",
    "Loisirs",
    "Santé",
    "Épargne",
    "Revenus",
    "Autres",
]


def normaliser(texte: str) -> str:
    """Minuscules, accents retirés — utilisé à la fois pour le libellé d'un
    mouvement et le motif d'une règle, pour qu'une règle "cotisation" attrape aussi
    "Cotisation URSSAF" ou "COTISATION-CAF" sans egard à la casse/accentuation."""
    sans_accents = unicodedata.normalize("NFKD", texte).encode("ascii", "ignore").decode("ascii")
    return sans_accents.lower().strip()


def assurer_categories_par_defaut(db: Session, user_id: int) -> list[CategorieBudget]:
    """Crée l'arbre par défaut à la toute première utilisation ; ne touche à rien
    ensuite — un utilisateur qui a déjà tout supprimé volontairement (ou n'a jamais
    accepté les catégories par défaut, cf. `create_categorie` qui marque aussi le
    foyer comme initialisé) ne doit pas les voir réapparaître (drapeau posé via
    `preferences_service`, seul point d'accès à `UserParametre`)."""
    existantes = db.query(CategorieBudget).filter(CategorieBudget.user_id == user_id).all()
    if existantes:
        return existantes
    if preferences_service.budget_categories_initialisees(db, user_id):
        return []
    creees = [CategorieBudget(user_id=user_id, nom=nom) for nom in DEFAULT_CATEGORIES]
    db.add_all(creees)
    preferences_service.marquer_budget_categories_initialisees(db, user_id)
    db.commit()
    for c in creees:
        db.refresh(c)
    return creees


def list_categories(db: Session, user_id: int) -> list[CategorieBudget]:
    return assurer_categories_par_defaut(db, user_id)


def create_categorie(db: Session, user_id: int, nom: str, parent_id: int | None) -> CategorieBudget:
    if parent_id is not None:
        parent = db.query(CategorieBudget).filter(CategorieBudget.id == parent_id, CategorieBudget.user_id == user_id).first()
        if parent is None:
            raise ValueError("Catégorie parente introuvable")
    categorie = CategorieBudget(user_id=user_id, nom=nom.strip(), parent_id=parent_id)
    db.add(categorie)
    preferences_service.marquer_budget_categories_initialisees(db, user_id)
    db.commit()
    db.refresh(categorie)
    return categorie


def rename_categorie(db: Session, user_id: int, categorie_id: int, nom: str) -> CategorieBudget:
    categorie = db.query(CategorieBudget).filter(CategorieBudget.id == categorie_id, CategorieBudget.user_id == user_id).first()
    if categorie is None:
        raise ValueError("Catégorie introuvable")
    categorie.nom = nom.strip()
    db.commit()
    db.refresh(categorie)
    return categorie


def delete_categorie(db: Session, user_id: int, categorie_id: int) -> None:
    """Supprime la catégorie et ses sous-catégories directes (arbre à un seul
    niveau, cf. `CategorieBudget`) : les mouvements qui les référençaient retombent
    à `categorie_id = None` (non catégorisé) plutôt que d'être supprimés, les cibles
    et règles associées disparaissent avec elles."""
    categorie = db.query(CategorieBudget).filter(CategorieBudget.id == categorie_id, CategorieBudget.user_id == user_id).first()
    if categorie is None:
        raise ValueError("Catégorie introuvable")
    enfants = db.query(CategorieBudget).filter(CategorieBudget.parent_id == categorie_id, CategorieBudget.user_id == user_id).all()
    ids = [categorie_id] + [e.id for e in enfants]

    db.query(MouvementBancaire).filter(MouvementBancaire.categorie_id.in_(ids), MouvementBancaire.user_id == user_id).update(
        {"categorie_id": None}, synchronize_session=False
    )
    db.query(BudgetCible).filter(BudgetCible.categorie_id.in_(ids), BudgetCible.user_id == user_id).delete(synchronize_session=False)
    db.query(RegleCategorisation).filter(RegleCategorisation.categorie_id.in_(ids), RegleCategorisation.user_id == user_id).delete(
        synchronize_session=False
    )
    for e in enfants:
        db.delete(e)
    db.delete(categorie)
    db.commit()


def list_regles(db: Session, user_id: int) -> list[RegleCategorisation]:
    return db.query(RegleCategorisation).filter(RegleCategorisation.user_id == user_id).order_by(RegleCategorisation.id).all()


def create_regle(db: Session, user_id: int, motif: str, categorie_id: int) -> RegleCategorisation:
    categorie = db.query(CategorieBudget).filter(CategorieBudget.id == categorie_id, CategorieBudget.user_id == user_id).first()
    if categorie is None:
        raise ValueError("Catégorie introuvable")
    regle = RegleCategorisation(user_id=user_id, motif=motif.strip(), categorie_id=categorie_id)
    db.add(regle)
    db.commit()
    db.refresh(regle)
    return regle


def delete_regle(db: Session, user_id: int, regle_id: int) -> None:
    regle = db.query(RegleCategorisation).filter(RegleCategorisation.id == regle_id, RegleCategorisation.user_id == user_id).first()
    if regle is None:
        raise ValueError("Règle introuvable")
    db.delete(regle)
    db.commit()


def categorie_correspondante(libelle: str, regles: list[RegleCategorisation]) -> int | None:
    """Première règle dont le motif apparaît dans le libellé normalisé — l'ordre de
    création fait foi (pas de notion de priorité distincte, plus simple à expliquer
    à l'utilisateur que l'un des deux se surprendrait à changer de comportement)."""
    libelle_normalise = normaliser(libelle)
    for regle in regles:
        if normaliser(regle.motif) in libelle_normalise:
            return regle.categorie_id
    return None
