"""Établissements et comptes structurels (écran Comptes, backlog X.1) — remplace
l'ancienne annotation texte libre `Holding.compte`. La répartition par détenteur
« pour tout un compte » (`set_quotites_compte`) ne crée AUCUNE nouvelle notion de
quotité : elle réapplique simplement `detenteurs_service.set_quotites_holding` à
chaque ligne du compte, décision délibérée pour ne jamais toucher au mécanisme de
calcul existant (`compute_parts`, `patrimoine_service`...), déjà entremêlé dans
plusieurs services financiers testés."""

from sqlalchemy.orm import Session

from ..models import Compte, Etablissement, Holding
from . import analysis_service, detenteurs_service

COMPTE_SANS_COMPTE = "Sans compte"


def list_etablissements(db: Session, user_id: int) -> list[Etablissement]:
    return db.query(Etablissement).filter(Etablissement.user_id == user_id).order_by(Etablissement.nom).all()


def create_etablissement(db: Session, user_id: int, nom: str) -> Etablissement:
    etablissement = Etablissement(user_id=user_id, nom=nom)
    db.add(etablissement)
    db.commit()
    db.refresh(etablissement)
    return etablissement


def update_etablissement(db: Session, etablissement: Etablissement, **champs) -> Etablissement:
    for cle, valeur in champs.items():
        if valeur is not None:
            setattr(etablissement, cle, valeur)
    db.commit()
    db.refresh(etablissement)
    return etablissement


def delete_etablissement(db: Session, etablissement: Etablissement) -> None:
    """Les comptes rattachés retombent à `etablissement_id = None` (« Sans
    établissement ») — jamais supprimés en cascade, un établissement n'est qu'un
    regroupement d'affichage, jamais une donnée constitutive d'un compte."""
    db.query(Compte).filter(Compte.etablissement_id == etablissement.id).update({"etablissement_id": None})
    db.delete(etablissement)
    db.commit()


def list_comptes(db: Session, user_id: int) -> list[Compte]:
    return db.query(Compte).filter(Compte.user_id == user_id).order_by(Compte.nom).all()


def create_compte(db: Session, user_id: int, nom: str, etablissement_id: int | None) -> Compte:
    compte = Compte(user_id=user_id, nom=nom, etablissement_id=etablissement_id)
    db.add(compte)
    db.commit()
    db.refresh(compte)
    return compte


def update_compte(db: Session, compte: Compte, **champs) -> Compte:
    for cle, valeur in champs.items():
        if valeur is not None or cle == "etablissement_id":
            # `etablissement_id=None` explicite = dérattacher (même contrat que
            # `LoanUpdate.holding_id`) — seul champ pour lequel `None` est une valeur
            # valide à appliquer, pas juste "absent" (le routeur ne passe ici que les
            # clés réellement fournies, via `exclude_unset=True`).
            setattr(compte, cle, valeur)
    db.commit()
    db.refresh(compte)
    return compte


def delete_compte(db: Session, compte: Compte) -> None:
    """Les `Holding` rattachés retombent à `compte_id = None` (« Sans compte ») —
    jamais supprimés, un compte n'est qu'un regroupement, jamais une donnée
    constitutive d'une position."""
    db.query(Holding).filter(Holding.compte_id == compte.id).update({"compte_id": None})
    db.delete(compte)
    db.commit()


def get_or_create_compte_sans_commit(db: Session, user_id: int, nom: str) -> Compte:
    """Variante sans commit — pour un appelant qui gère lui-même sa frontière de
    transaction (import CSV en masse, reconstruction du grand livre) : `db.flush()`
    rend le nouvel id visible aux requêtes suivantes de la MÊME session (donc au
    cache local de l'appelant, ex. `comptes_cache` dans `import_confirm`) sans
    committer un travail encore en cours ailleurs dans la même transaction (« tout
    ou rien », LOT 3.3)."""
    compte = db.query(Compte).filter(Compte.user_id == user_id, Compte.nom == nom).first()
    if compte is not None:
        return compte
    compte = Compte(user_id=user_id, nom=nom, etablissement_id=None)
    db.add(compte)
    db.flush()
    return compte


def get_or_create_compte(db: Session, user_id: int, nom: str) -> Compte:
    """Résolution d'un nom saisi vers un compte existant, ou création à la volée —
    committe immédiatement (usage : une seule mutation isolée, ex.
    `routers/portfolio.py::create_holding`/`update_holding`). Pour un import en
    masse qui gère sa propre transaction, cf. `get_or_create_compte_sans_commit`."""
    compte = get_or_create_compte_sans_commit(db, user_id, nom)
    db.commit()
    db.refresh(compte)
    return compte


def set_quotites_compte(db: Session, user_id: int, compte: Compte, quotites: list[tuple[int, float]]) -> None:
    """Applique la MÊME répartition à chaque `Holding` actuellement rattaché à ce
    compte — pas de nouvelle table de quotités, boucle sur
    `detenteurs_service.set_quotites_holding` (delete-puis-insert) pour chaque
    ligne. Un compte sans aucune ligne ne fait rien (pas d'erreur) ; un compte à une
    seule ligne se comporte exactement comme l'ancienne saisie par ligne."""
    holdings = db.query(Holding).filter(Holding.compte_id == compte.id, Holding.user_id == user_id).all()
    for holding in holdings:
        detenteurs_service.set_quotites_holding(db, user_id, holding, quotites)


def solde_par_compte(db: Session, user_id: int, holdings_visibles_ids: set[int] | None = None) -> list[dict]:
    """Solde de chaque compte du foyer, TOUS types d'actifs confondus (contrairement
    à `analysis_service.repartition_par_compte`, restreinte au portefeuille
    financier) — réutilise `value_holdings` pour la valorisation individuelle,
    aucune nouvelle logique de calcul.

    `holdings_visibles_ids` : périmètre d'un compte `invite` (backlog 2.L.2, cf.
    `routers/portfolio.py::_holdings_visibles`) — `None` pour propriétaire/membre
    (aucun filtre, tout le foyer). Sans filtre, un compte sans aucune ligne
    rattachée apparaît quand même (solde 0, utile pour un compte tout juste créé) ;
    avec un périmètre invité, un compte qui n'a plus AUCUNE ligne visible dans ce
    périmètre est entièrement omis (un invité ne doit jamais voir un compte dont il
    ne peut voir aucune ligne)."""
    holdings = db.query(Holding).filter(Holding.user_id == user_id).all()
    if holdings_visibles_ids is not None:
        holdings = [h for h in holdings if h.id in holdings_visibles_ids]
    valued = analysis_service.value_holdings(holdings)

    comptes = list_comptes(db, user_id)
    par_compte_id: dict[int | None, dict] = {
        compte.id: {"compte": compte, "solde": 0.0, "nombre_lignes": 0} for compte in comptes
    }
    sans_compte = {"compte": None, "solde": 0.0, "nombre_lignes": 0}

    for v in valued:
        cible = par_compte_id.get(v.holding.compte_id, sans_compte) if v.holding.compte_id is not None else sans_compte
        cible["solde"] += v.valeur
        cible["nombre_lignes"] += 1

    resultats = list(par_compte_id.values())
    if holdings_visibles_ids is not None:
        # Périmètre invité : un compte devenu sans aucune ligne visible est omis en
        # entier (jamais un solde 0 qui laisserait deviner son existence).
        resultats = [r for r in resultats if r["nombre_lignes"] > 0]
    if sans_compte["nombre_lignes"] > 0:
        resultats.append(sans_compte)
    return resultats
