"""Personnes/sociétés du foyer et quotités de propriété (backlog 2.L.1) — à qui
appartient quoi, indépendamment du compte de connexion (`User`, isolation stricte
entre foyers différents). Deux répartitions distinctes et indépendantes existent :
sur l'actif (`QuotiteHolding`) et sur l'emprunt éventuellement rattaché
(`QuotiteLoan`), la seconde héritant par défaut de la première quand elle n'est pas
explicitement saisie — cf. `compute_parts`."""

from sqlalchemy.orm import Session

from ..models import Detenteur, Holding, Loan, PerimetreInvite, QuotiteHolding, QuotiteLoan
from . import loan_service

TOLERANCE_SOMME_PCT = 0.01


def perimetre_invite(db: Session, user_id_invite: int) -> list[int]:
    """Détenteurs auxquels un compte `invite` (backlog 2.L.2) a accès en lecture —
    liste vide si le propriétaire ne lui en a assigné aucun (pas d'accès implicite)."""
    lignes = db.query(PerimetreInvite).filter(PerimetreInvite.user_id == user_id_invite).all()
    return [ligne.detenteur_id for ligne in lignes]


def list_detenteurs(db: Session, user_id: int) -> list[Detenteur]:
    return db.query(Detenteur).filter(Detenteur.user_id == user_id).order_by(Detenteur.nom).all()


def _verifier_nom_detenteur_libre(db: Session, user_id: int, nom: str, id_exclu: int | None = None) -> None:
    """Contrairement à `Compte`/`Etablissement`, `Detenteur` n'a pas de contrainte
    d'unicité en base : deux « Alice » pouvaient donc coexister, indiscernables dans
    tous les sélecteurs de quotités (fiche d'un actif, d'un compte, d'un emprunt) et
    dans le filtre par détenteur — l'utilisateur n'avait aucun moyen de savoir
    laquelle il répartissait (recette du 02/09/2026). Refus explicite plutôt qu'une
    migration ajoutant la contrainte : une base existante peut déjà contenir des
    doublons, qu'une contrainte rétroactive rendrait immigrable."""
    requete = db.query(Detenteur).filter(Detenteur.user_id == user_id, Detenteur.nom == nom)
    if id_exclu is not None:
        requete = requete.filter(Detenteur.id != id_exclu)
    if requete.first() is not None:
        raise ValueError(f"Un détenteur nommé « {nom} » existe déjà.")


def create_detenteur(db: Session, user_id: int, nom: str, type_: str) -> Detenteur:
    _verifier_nom_detenteur_libre(db, user_id, nom)
    detenteur = Detenteur(user_id=user_id, nom=nom, type=type_)
    db.add(detenteur)
    db.commit()
    db.refresh(detenteur)
    return detenteur


def update_detenteur(db: Session, detenteur: Detenteur, **champs: str) -> Detenteur:
    if champs.get("nom") is not None:
        _verifier_nom_detenteur_libre(db, detenteur.user_id, champs["nom"], id_exclu=detenteur.id)
    for cle, valeur in champs.items():
        if valeur is not None:
            setattr(detenteur, cle, valeur)
    db.commit()
    db.refresh(detenteur)
    return detenteur


def delete_detenteur(db: Session, detenteur: Detenteur) -> None:
    """Supprime le détenteur et ses quotités (actif + emprunt) — les lignes du
    patrimoine elles-mêmes ne sont jamais touchées, leur répartition retombe
    implicitement à 100 % foyer."""
    db.query(QuotiteHolding).filter(QuotiteHolding.detenteur_id == detenteur.id).delete()
    db.query(QuotiteLoan).filter(QuotiteLoan.detenteur_id == detenteur.id).delete()
    db.delete(detenteur)
    db.commit()


def _valider_quotites(db: Session, user_id: int, quotites: list[tuple[int, float]]) -> None:
    """Lève `ValueError` (message destiné à l'utilisateur) si la répartition proposée
    est invalide : détenteur en double, détenteur d'un autre compte (IDOR), ou somme
    différente de 100 %. Une liste vide est toujours valide (retire toute
    répartition)."""
    if not quotites:
        return

    detenteur_ids = [d_id for d_id, _ in quotites]
    if len(set(detenteur_ids)) != len(detenteur_ids):
        raise ValueError("Un même détenteur ne peut apparaître qu'une seule fois dans la répartition")

    nb_valides = db.query(Detenteur).filter(Detenteur.user_id == user_id, Detenteur.id.in_(detenteur_ids)).count()
    if nb_valides != len(set(detenteur_ids)):
        raise ValueError("Détenteur introuvable")

    total = sum(pct for _, pct in quotites)
    if abs(total - 100.0) > TOLERANCE_SOMME_PCT:
        raise ValueError(f"La somme des quotités doit être égale à 100 % (actuellement {total:.2f} %)")


def set_quotites_holding(db: Session, user_id: int, holding: Holding, quotites: list[tuple[int, float]]) -> None:
    """Remplace intégralement la répartition d'un actif (même pattern delete-puis-
    insert que `FundComposition` ailleurs dans le code)."""
    _valider_quotites(db, user_id, quotites)
    db.query(QuotiteHolding).filter(QuotiteHolding.holding_id == holding.id).delete()
    db.add_all(QuotiteHolding(holding_id=holding.id, detenteur_id=d, quotite_pct=p) for d, p in quotites)
    db.commit()


def set_quotites_loan(db: Session, user_id: int, loan: Loan, quotites: list[tuple[int, float]]) -> None:
    """Même principe que `set_quotites_holding`, pour un emprunt."""
    _valider_quotites(db, user_id, quotites)
    db.query(QuotiteLoan).filter(QuotiteLoan.loan_id == loan.id).delete()
    db.add_all(QuotiteLoan(loan_id=loan.id, detenteur_id=d, quotite_pct=p) for d, p in quotites)
    db.commit()


def compute_pourcentages(db: Session, holding: Holding) -> dict[int, float]:
    """{detenteur_id: quotite_pct} pour cet actif, découplé de toute `valeur` — pour un
    besoin qui doit appliquer le même pourcentage à plusieurs dates d'une série
    (`patrimoine_history_service`), contrairement à `compute_parts` qui rend une part
    déjà multipliée par une `valeur` propre à une seule date. `{}` si aucune quotité
    saisie (100 % foyer implicite, même contrat que `compute_parts`)."""
    quotites = db.query(QuotiteHolding).filter(QuotiteHolding.holding_id == holding.id).all()
    return {q.detenteur_id: q.quotite_pct for q in quotites}


def compute_pourcentage_emprunt(db: Session, holding: Holding, emprunt: Loan) -> dict[int, float]:
    """Quotités de l'emprunt rattaché à `holding` : ses propres `QuotiteLoan` si
    saisies, sinon héritées de `compute_pourcentages(db, holding)` — même règle de
    repli que `compute_parts`."""
    lignes_emprunt = db.query(QuotiteLoan).filter(QuotiteLoan.loan_id == emprunt.id).all()
    if lignes_emprunt:
        return {q.detenteur_id: q.quotite_pct for q in lignes_emprunt}
    return compute_pourcentages(db, holding)


def compute_parts(db: Session, holding: Holding, valeur: float) -> dict[int, dict[str, float]]:
    """Part détenue et part nette par détenteur pour cette ligne (backlog 2.L.1).
    `valeur` : valeur déjà calculée de la ligne (`analysis_service.value_holdings`),
    passée en paramètre pour ne jamais diverger de la valeur affichée ailleurs.

    Renvoie `{}` si la ligne n'a aucune quotité saisie (100 % foyer implicite,
    comportement historique inchangé). Ne couvre, pour ce premier incrément, que les
    détenteurs qui possèdent une part de l'ACTIF — un détenteur qui n'aurait qu'une
    quotité sur l'emprunt (sans posséder l'actif) n'a pas de cas d'usage identifié à
    ce stade et n'apparaît pas dans le résultat."""
    quotites_actif = db.query(QuotiteHolding).filter(QuotiteHolding.holding_id == holding.id).all()
    if not quotites_actif:
        return {}

    # `Loan.holding_id` n'a pas de contrainte d'unicité (plusieurs emprunts peuvent
    # financer le même bien) : sommer le CRD de CHAQUE emprunt rattaché, même règle
    # que `patrimoine_service._crd_par_ligne` — un seul `.first()` sous-évaluerait la
    # dette dès qu'un bien porte plus d'un emprunt.
    emprunts = db.query(Loan).filter(Loan.holding_id == holding.id).all()
    part_dette_par_detenteur: dict[int, float] = {}
    for emprunt in emprunts:
        crd = loan_service.compute_capital_restant_du(emprunt)
        for detenteur_id, pct in compute_pourcentage_emprunt(db, holding, emprunt).items():
            part_dette_par_detenteur[detenteur_id] = part_dette_par_detenteur.get(detenteur_id, 0.0) + pct / 100 * crd

    resultat: dict[int, dict[str, float]] = {}
    for q in quotites_actif:
        part_detenue = q.quotite_pct / 100 * valeur
        part_dette = part_dette_par_detenteur.get(q.detenteur_id, 0.0)
        resultat[q.detenteur_id] = {
            "part_detenue": round(part_detenue, 2),
            "part_nette": round(part_detenue - part_dette, 2),
        }
    return resultat
