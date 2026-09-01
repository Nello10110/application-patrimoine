"""Écran Budget (backlog 2.N.2) : indicateurs de période (entrées, sorties,
disponible, dépenses récurrentes), répartition des sorties par catégorie comparée
au budget cible."""

from datetime import date as date_cls
from datetime import datetime

from sqlalchemy import func
from sqlalchemy.orm import Session

from ..models import TYPES_EPARGNE, BudgetCible, CategorieBudget, Holding, MouvementBancaire
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


# ---------------------------------------------------------------------------
# Jonction budget ↔ patrimoine (backlog 2.N.4)
# ---------------------------------------------------------------------------

# Noms des catégories par défaut (`budget_categories_service.DEFAULT_CATEGORIES`)
# utilisés pour repérer "l'épargne" et "le logement" sans nouveau champ sur
# `CategorieBudget` : recherche par nom (insensible à la casse), racine uniquement.
# Limite assumée et documentée : si l'utilisateur renomme ces deux catégories, le
# rapprochement ne les retrouve plus — acceptable pour un item d'effort S, le
# renommage restant rare pour des catégories aussi structurantes.
NOM_CATEGORIE_EPARGNE = "épargne"
NOM_CATEGORIE_LOGEMENT = "logement"


def _categorie_racine_par_nom(db: Session, user_id: int, nom: str) -> CategorieBudget | None:
    # Comparaison normalisée en Python plutôt qu'un `ILIKE` SQL : `LOWER()` de
    # SQLite ne minuscule que l'ASCII (aucune extension ICU chargée), donc ne
    # reconnaît pas "Épargne" == "épargne" — `normaliser` (accents retirés) gère ce
    # cas correctement, comme pour la correspondance des règles de catégorisation.
    nom_normalise = budget_categories_service.normaliser(nom)
    racines = db.query(CategorieBudget).filter(CategorieBudget.user_id == user_id, CategorieBudget.parent_id.is_(None)).all()
    return next((c for c in racines if budget_categories_service.normaliser(c.nom) == nom_normalise), None)


def _nombre_mois_periode(date_debut: str, date_fin: str) -> int:
    d1 = datetime.strptime(date_debut, "%Y-%m-%d").date()
    d2 = datetime.strptime(date_fin, "%Y-%m-%d").date()
    return max(1, (d2.year - d1.year) * 12 + (d2.month - d1.month) + 1)


def compute_jonction_patrimoine(db: Session, user_id: int, date_debut: str, date_fin: str) -> dict:
    """Taux d'épargne réel, reste à vivre, et suggestion de versement mensuel pour
    le Simulateur (backlog 2.N.4) — dérivés du budget réellement observé plutôt que
    d'une hypothèse saisie à la main."""
    # Import différé : évite un cycle avec `budget_recurrences_service`, qui importe
    # ce module pour `list_mouvements`.
    from . import budget_recurrences_service

    summary = compute_summary(db, user_id, date_debut, date_fin)
    entrees = summary["entrees"]

    categorie_epargne = _categorie_racine_par_nom(db, user_id, NOM_CATEGORIE_EPARGNE)
    montant_epargne = None
    taux_epargne_reel_pct = None
    if categorie_epargne is not None:
        montant_epargne = next(
            (item["montant"] for item in summary["repartition_sorties"] if item["categorie_id"] == categorie_epargne.id), 0.0
        )
        taux_epargne_reel_pct = round(montant_epargne / entrees * 100, 1) if entrees > 0 else None

    categorie_logement = _categorie_racine_par_nom(db, user_id, NOM_CATEGORIE_LOGEMENT)
    montant_logement = None
    reste_a_vivre = None
    if categorie_logement is not None:
        montant_logement = next(
            (item["montant"] for item in summary["repartition_sorties"] if item["categorie_id"] == categorie_logement.id), 0.0
        )
        # `aujourdhui` calé sur la fin de la période demandée (pas la date système) :
        # sans ça, consulter un mois passé exclurait à tort toute charge récurrente
        # de cette époque via la fenêtre de récence de `detect_recurrences` (45 jours
        # glissants depuis "aujourd'hui" réel, non pertinents pour une période révolue).
        charges_recurrentes_mensuelles = sum(
            r.montant_actuel
            for r in budget_recurrences_service.detect_recurrences(db, user_id, aujourdhui=date_cls.fromisoformat(date_fin))
            if r.periodicite == "mensuelle"
        )
        reste_a_vivre = round(entrees - montant_logement - charges_recurrentes_mensuelles, 2)

    versement_mensuel_suggere = round(summary["disponible"] / _nombre_mois_periode(date_debut, date_fin), 2)

    # Versements mensuels déclarés sur les comptes Épargne (backlog 2.S.1) — somme
    # séparée de `versement_mensuel_suggere` (jamais fusionnée ici) : le Simulateur
    # additionne les deux côté frontend, avec une légende détaillant chaque source.
    versement_mensuel_epargne_declare = (
        db.query(func.sum(Holding.versement_mensuel))
        .filter(
            Holding.user_id == user_id,
            Holding.type_actif.in_(TYPES_EPARGNE),
            Holding.versement_mensuel.isnot(None),
        )
        .scalar()
        or 0.0
    )

    return {
        "taux_epargne_reel_pct": taux_epargne_reel_pct,
        "reste_a_vivre": reste_a_vivre,
        "versement_mensuel_suggere": versement_mensuel_suggere,
        "versement_mensuel_epargne_declare": round(versement_mensuel_epargne_declare, 2),
        "categorie_epargne_introuvable": categorie_epargne is None,
        "categorie_logement_introuvable": categorie_logement is None,
    }
