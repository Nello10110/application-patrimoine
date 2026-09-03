"""Établissements et comptes structurels (écran Comptes, backlog X.1) — remplace
l'ancienne annotation texte libre `Holding.compte`. La répartition par détenteur
« pour tout un compte » (`set_quotites_compte`) ne crée AUCUNE nouvelle notion de
quotité : elle réapplique simplement `detenteurs_service.set_quotites_holding`/
`set_quotites_loan` à chaque ligne du compte et à chaque emprunt qui lui est
rattaché (via `Loan.holding_id`), décision délibérée pour ne jamais toucher au
mécanisme de calcul existant (`compute_parts`, `patrimoine_service`...), déjà
entremêlé dans plusieurs services financiers testés."""

from sqlalchemy import or_
from sqlalchemy.orm import Session

from ..models import TYPES_ACTIF_SANS_ETABLISSEMENT, Compte, Etablissement, Holding, Loan
from . import analysis_service, detenteurs_service


def _verifier_nom_etablissement_libre(db: Session, user_id: int, nom: str, id_exclu: int | None = None) -> None:
    """`UniqueConstraint(user_id, nom)` est la garantie de dernier recours ; sans ce
    contrôle en amont, un doublon remonterait en `IntegrityError` SQLAlchemy non
    interceptée, donc en HTTP 500 avec une trace brute au lieu d'un message
    exploitable (recette du 02/09/2026). `id_exclu` : le renommage d'un
    établissement vers son propre nom ne doit pas se refuser lui-même."""
    requete = db.query(Etablissement).filter(Etablissement.user_id == user_id, Etablissement.nom == nom)
    if id_exclu is not None:
        requete = requete.filter(Etablissement.id != id_exclu)
    if requete.first() is not None:
        raise ValueError(f"Un établissement nommé « {nom} » existe déjà.")


def _verifier_nom_compte_libre(db: Session, user_id: int, nom: str, id_exclu: int | None = None) -> None:
    """Même rôle que `_verifier_nom_etablissement_libre`, pour les comptes."""
    requete = db.query(Compte).filter(Compte.user_id == user_id, Compte.nom == nom)
    if id_exclu is not None:
        requete = requete.filter(Compte.id != id_exclu)
    if requete.first() is not None:
        raise ValueError(f"Un compte nommé « {nom} » existe déjà.")


def list_etablissements(db: Session, user_id: int) -> list[Etablissement]:
    return db.query(Etablissement).filter(Etablissement.user_id == user_id).order_by(Etablissement.nom).all()


def create_etablissement(db: Session, user_id: int, nom: str) -> Etablissement:
    _verifier_nom_etablissement_libre(db, user_id, nom)
    etablissement = Etablissement(user_id=user_id, nom=nom)
    db.add(etablissement)
    db.commit()
    db.refresh(etablissement)
    return etablissement


def get_or_create_etablissement(db: Session, user_id: int, nom: str) -> Etablissement:
    """Résolution d'un nom saisi vers un établissement existant, ou création à la
    volée (revue du 03/09/2026) — même patron que `get_or_create_compte`, pour les
    formulaires qui créent un compte ET son établissement en une seule saisie
    (« + Nouvel établissement... » depuis un sélecteur de compte). Contrairement à
    `create_etablissement`, ne lève JAMAIS sur un nom déjà pris : retrouver
    l'établissement existant est le comportement attendu ici, pas une erreur."""
    etablissement = db.query(Etablissement).filter(Etablissement.user_id == user_id, Etablissement.nom == nom).first()
    if etablissement is not None:
        return etablissement
    return create_etablissement(db, user_id, nom)


def update_etablissement(db: Session, etablissement: Etablissement, **champs) -> Etablissement:
    if champs.get("nom") is not None:
        _verifier_nom_etablissement_libre(db, etablissement.user_id, champs["nom"], id_exclu=etablissement.id)
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
    _verifier_nom_compte_libre(db, user_id, nom)
    compte = Compte(user_id=user_id, nom=nom, etablissement_id=etablissement_id)
    db.add(compte)
    db.commit()
    db.refresh(compte)
    return compte


def update_compte(db: Session, compte: Compte, **champs) -> Compte:
    if champs.get("nom") is not None:
        _verifier_nom_compte_libre(db, compte.user_id, champs["nom"], id_exclu=compte.id)
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


def get_or_create_compte_sans_commit(db: Session, user_id: int, nom: str, etablissement_id: int | None = None) -> Compte:
    """Variante sans commit — pour un appelant qui gère lui-même sa frontière de
    transaction (import CSV en masse, reconstruction du grand livre) : `db.flush()`
    rend le nouvel id visible aux requêtes suivantes de la MÊME session (donc au
    cache local de l'appelant, ex. `comptes_cache` dans `import_confirm`) sans
    committer un travail encore en cours ailleurs dans la même transaction (« tout
    ou rien », LOT 3.3).

    `etablissement_id` (revue du 03/09/2026) : posé UNIQUEMENT à la création — un
    compte déjà existant sous ce nom garde son établissement actuel, jamais écrasé
    silencieusement par un appelant qui en fournirait un différent (ex. deux imports
    successifs qui ne s'accordent pas sur l'établissement d'un même nom de compte).
    Pas d'IDOR à vérifier ici (pas d'accès réseau dans ce service) : à charge de
    l'appelant, comme pour `Compte.etablissement_id` partout ailleurs."""
    compte = db.query(Compte).filter(Compte.user_id == user_id, Compte.nom == nom).first()
    if compte is not None:
        return compte
    compte = Compte(user_id=user_id, nom=nom, etablissement_id=etablissement_id)
    db.add(compte)
    db.flush()
    return compte


def get_or_create_compte(db: Session, user_id: int, nom: str, etablissement_id: int | None = None) -> Compte:
    """Résolution d'un nom saisi vers un compte existant, ou création à la volée —
    committe immédiatement (usage : une seule mutation isolée, ex.
    `routers/portfolio.py::create_holding`/`update_holding`). Pour un import en
    masse qui gère sa propre transaction, cf. `get_or_create_compte_sans_commit`."""
    compte = get_or_create_compte_sans_commit(db, user_id, nom, etablissement_id)
    db.commit()
    db.refresh(compte)
    return compte


def compter_holdings_sans_compte(db: Session, user_id: int) -> int:
    """Nombre de lignes financières sans compte (revue du 03/09/2026) — alimente le
    compteur `holdings_sans_compte` exposé par `/api/auth/me` (même point
    d'injection que `onboarding_termine`), qui déclenche l'écran de rattrapage
    bloquant côté frontend tant qu'il est non nul.

    `type_actif IS NULL` doit être COMPTÉ (n'est pas exempté) — c'est la valeur par
    défaut d'une ligne pas encore catégorisée, précisément ce que cet écran doit
    corriger, même règle que `HoldingCreate._valider_compte_requis`. D'où le
    `or_(.is_(None), ...)` plutôt qu'un `.notin_()` seul : `NULL NOT IN (...)` vaut
    NULL en SQL (ni vrai ni faux), pas TRUE — un `.notin_()` seul EXCLURAIT ces
    lignes du compte au lieu de les compter (piège déjà documenté sur ce projet,
    cf. `analysis_service.holdings_financiers`)."""
    return (
        db.query(Holding)
        .filter(
            Holding.user_id == user_id,
            Holding.compte_id.is_(None),
            or_(Holding.type_actif.is_(None), Holding.type_actif.notin_(TYPES_ACTIF_SANS_ETABLISSEMENT)),
        )
        .count()
    )


def set_quotites_compte(db: Session, user_id: int, compte: Compte, quotites: list[tuple[int, float]]) -> None:
    """Applique la MÊME répartition à chaque `Holding` actuellement rattaché à ce
    compte, ET à chaque `Loan` rattaché à l'une de ces lignes (`Loan.holding_id`) —
    pas de nouvelle table de quotités, boucle sur `detenteurs_service.
    set_quotites_holding`/`set_quotites_loan` (delete-puis-insert) pour chacun.
    Demande explicite de l'utilisateur : la répartition définie pour tout un compte
    doit couvrir « pareil pour un compte courant, un compte titre, un immobilier,
    une dette » — un emprunt rattaché au bien immobilier d'un compte suit donc la
    même répartition que le bien lui-même, sans étape séparée. Un compte sans
    aucune ligne ni emprunt ne fait rien (pas d'erreur) ; un compte à une seule
    ligne sans emprunt se comporte exactement comme l'ancienne saisie par ligne."""
    holdings = db.query(Holding).filter(Holding.compte_id == compte.id, Holding.user_id == user_id).all()
    holding_ids = [h.id for h in holdings]
    loans = (
        db.query(Loan).filter(Loan.holding_id.in_(holding_ids), Loan.user_id == user_id).all() if holding_ids else []
    )

    # UN SEUL commit pour tout le compte (revue du 03/09/2026). Auparavant chaque
    # ligne et chaque emprunt committait pour son compte : un échec à mi-parcours —
    # une quotité refusée, un détenteur supprimé entre-temps — laissait le compte à
    # moitié réparti, sans que rien n'indique où. Du point de vue de l'utilisateur
    # c'est une seule action (« répartir ce compte ») : elle réussit ou elle ne
    # change rien.
    try:
        for holding in holdings:
            detenteurs_service.set_quotites_holding(db, user_id, holding, quotites, commit=False)
        for loan in loans:
            detenteurs_service.set_quotites_loan(db, user_id, loan, quotites, commit=False)
        db.commit()
    except Exception:
        db.rollback()
        raise


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
