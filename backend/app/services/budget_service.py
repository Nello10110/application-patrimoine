"""Écran Budget (backlog 2.N.2) : indicateurs de période (entrées, sorties,
disponible, dépenses récurrentes), répartition des sorties par catégorie comparée
au budget cible."""

from datetime import date as date_cls, datetime

from sqlalchemy.orm import Session

from ..models import BudgetCible, CategorieBudget, MouvementBancaire
from . import budget_categories_service


def list_mouvements(
    db: Session,
    user_id: int,
    date_debut: str | None = None,
    date_fin: str | None = None,
    categorie_id: int | None = None,
    compte: str | None = None,
) -> list[MouvementBancaire]:
    q = db.query(MouvementBancaire).filter(MouvementBancaire.user_id == user_id)
    if date_debut:
        q = q.filter(MouvementBancaire.date >= date_debut)
    if date_fin:
        q = q.filter(MouvementBancaire.date <= date_fin)
    if categorie_id is not None:
        q = q.filter(MouvementBancaire.categorie_id == categorie_id)
    if compte:
        q = q.filter(MouvementBancaire.compte == compte)
    return q.order_by(MouvementBancaire.date.desc(), MouvementBancaire.id.desc()).all()


def categoriser_mouvement(db: Session, user_id: int, mouvement_id: int, categorie_id: int | None) -> MouvementBancaire:
    """Correction manuelle (LOT 6.1) : pose `categorise_manuellement=True` pour que
    `budget_import_service.reappliquer_regles` ne l'écrase plus jamais."""
    mouvement = db.query(MouvementBancaire).filter(MouvementBancaire.id == mouvement_id, MouvementBancaire.user_id == user_id).first()
    if mouvement is None:
        raise ValueError("Mouvement introuvable")
    if categorie_id is not None:
        categorie = db.query(CategorieBudget).filter(CategorieBudget.id == categorie_id, CategorieBudget.user_id == user_id).first()
        if categorie is None:
            raise ValueError("Catégorie introuvable")
    mouvement.categorie_id = categorie_id
    mouvement.categorise_manuellement = True
    db.commit()
    db.refresh(mouvement)
    return mouvement


def _mois_precedents(date_reference: str, n: int) -> str:
    d = datetime.strptime(date_reference, "%Y-%m-%d").date()
    mois = d.month - n
    annee = d.year
    while mois <= 0:
        mois += 12
        annee -= 1
    return date_cls(annee, mois, 1).isoformat()


def compute_depenses_recurrentes_mensuelles(db: Session, user_id: int, date_fin: str) -> float:
    """Heuristique légère (backlog 2.N.2) : un couple (libellé normalisé, montant
    arrondi à l'euro) qui revient sur au moins 2 des 3 mois précédant `date_fin` est
    considéré comme une charge récurrente ; leur somme approxime la charge fixe
    mensuelle. Détection plus poussée (hausse de prix, abonnement inutilisé) laissée
    à N.3, qui réutilisera cette même clé de correspondance."""
    depuis = _mois_precedents(date_fin, 3)
    mouvements = list_mouvements(db, user_id, date_debut=depuis, date_fin=date_fin)
    mois_vus: dict[tuple[str, float], set[str]] = {}
    dernier_montant: dict[tuple[str, float], float] = {}
    for m in mouvements:
        if m.montant >= 0:
            continue
        cle = (budget_categories_service.normaliser(m.libelle), round(abs(m.montant)))
        mois_vus.setdefault(cle, set()).add(m.date[:7])
        dernier_montant[cle] = abs(m.montant)
    return round(sum(dernier_montant[cle] for cle, mois in mois_vus.items() if len(mois) >= 2), 2)


def _categorie_racine_id(categorie: CategorieBudget) -> int:
    return categorie.parent_id if categorie.parent_id is not None else categorie.id


def compute_summary(db: Session, user_id: int, date_debut: str, date_fin: str) -> dict:
    mouvements = list_mouvements(db, user_id, date_debut=date_debut, date_fin=date_fin)
    entrees = sum(m.montant for m in mouvements if m.montant > 0)
    sorties = sum(-m.montant for m in mouvements if m.montant < 0)

    categories = {c.id: c for c in db.query(CategorieBudget).filter(CategorieBudget.user_id == user_id).all()}
    repartition: dict[int | None, float] = {}
    for m in mouvements:
        if m.montant >= 0:
            continue
        cle = _categorie_racine_id(categories[m.categorie_id]) if m.categorie_id in categories else None
        repartition[cle] = repartition.get(cle, 0.0) + (-m.montant)

    cibles = {c.categorie_id: c.montant_mensuel for c in db.query(BudgetCible).filter(BudgetCible.user_id == user_id).all()}

    repartition_items = [
        {
            "categorie_id": cle,
            "categorie_nom": categories[cle].nom if cle is not None and cle in categories else "Non catégorisé",
            "montant": round(montant, 2),
            "cible_mensuelle": cibles.get(cle) if cle is not None else None,
        }
        for cle, montant in sorted(repartition.items(), key=lambda kv: kv[1], reverse=True)
    ]

    return {
        "entrees": round(entrees, 2),
        "sorties": round(sorties, 2),
        "disponible": round(entrees - sorties, 2),
        "depenses_recurrentes_mensuelles": compute_depenses_recurrentes_mensuelles(db, user_id, date_fin),
        "repartition_sorties": repartition_items,
    }


def list_cibles(db: Session, user_id: int) -> list[BudgetCible]:
    return db.query(BudgetCible).filter(BudgetCible.user_id == user_id).all()


def set_cible(db: Session, user_id: int, categorie_id: int, montant_mensuel: float) -> BudgetCible:
    categorie = db.query(CategorieBudget).filter(CategorieBudget.id == categorie_id, CategorieBudget.user_id == user_id).first()
    if categorie is None:
        raise ValueError("Catégorie introuvable")
    if categorie.parent_id is not None:
        raise ValueError("Le budget cible se règle sur une catégorie racine, pas une sous-catégorie")
    cible = db.query(BudgetCible).filter(BudgetCible.categorie_id == categorie_id, BudgetCible.user_id == user_id).first()
    if cible is None:
        cible = BudgetCible(user_id=user_id, categorie_id=categorie_id, montant_mensuel=montant_mensuel)
        db.add(cible)
    else:
        cible.montant_mensuel = montant_mensuel
    db.commit()
    db.refresh(cible)
    return cible


def delete_cible(db: Session, user_id: int, categorie_id: int) -> None:
    db.query(BudgetCible).filter(BudgetCible.categorie_id == categorie_id, BudgetCible.user_id == user_id).delete()
    db.commit()
