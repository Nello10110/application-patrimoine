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


def set_quotites_holding(
    db: Session, user_id: int, holding: Holding, quotites: list[tuple[int, float]], *, commit: bool = True
) -> None:
    """Remplace intégralement la répartition d'un actif (même pattern delete-puis-
    insert que `FundComposition` ailleurs dans le code).

    `commit=False` : pour un appelant qui répartit PLUSIEURS lignes en une seule
    opération utilisateur (`comptes_service.set_quotites_compte`) et doit pouvoir
    tout annuler d'un bloc — sans quoi un échec à mi-parcours laissait le compte à
    moitié réparti, sans aucun moyen de savoir où (revue du 03/09/2026)."""
    _valider_quotites(db, user_id, quotites)
    db.query(QuotiteHolding).filter(QuotiteHolding.holding_id == holding.id).delete()
    db.add_all(QuotiteHolding(holding_id=holding.id, detenteur_id=d, quotite_pct=p) for d, p in quotites)
    if commit:
        db.commit()


def set_quotites_loan(
    db: Session, user_id: int, loan: Loan, quotites: list[tuple[int, float]], *, commit: bool = True
) -> None:
    """Même principe que `set_quotites_holding`, pour un emprunt."""
    _valider_quotites(db, user_id, quotites)
    db.query(QuotiteLoan).filter(QuotiteLoan.loan_id == loan.id).delete()
    db.add_all(QuotiteLoan(loan_id=loan.id, detenteur_id=d, quotite_pct=p) for d, p in quotites)
    if commit:
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


def _assembler_parts(
    quotites_actif: list[tuple[int, float]],
    valeur: float,
    part_dette_par_detenteur: dict[int, float],
) -> dict[int, dict[str, float]]:
    """Cœur de calcul partagé par `compute_parts` (une ligne) et
    `compute_parts_bulk` (toutes les lignes d'un coup).

    Extrait pour une raison précise : les deux chemins DOIVENT produire exactement
    les mêmes chiffres. Les laisser diverger d'un arrondi ferait afficher deux
    montants différents pour la même ligne selon l'écran qui la demande."""
    resultat: dict[int, dict[str, float]] = {}
    for detenteur_id, quotite_pct in quotites_actif:
        part_detenue = quotite_pct / 100 * valeur
        part_dette = part_dette_par_detenteur.get(detenteur_id, 0.0)
        resultat[detenteur_id] = {
            "part_detenue": round(part_detenue, 2),
            "part_nette": round(part_detenue - part_dette, 2),
        }
    return resultat


def compute_parts_bulk(
    db: Session, holdings_et_valeurs: list[tuple[Holding, float]]
) -> dict[int, dict[int, dict[str, float]]]:
    """`{holding_id: <même contenu que compute_parts>}` pour TOUTES les lignes en
    trois requêtes fixes, au lieu de trois à quatre par ligne.

    Mesuré avant correctif sur une base réelle (revue du 03/09/2026) :
    `compute_patrimoine_net(detenteur_id=...)` déclenchait **207 requêtes SQL pour
    51 lignes** — chaque ligne relisait ses quotités, ses emprunts, et les quotités
    de chacun de ses emprunts. Le coût croît avec le patrimoine, précisément quand
    l'écran devient intéressant.

    Une ligne sans aucune quotité saisie est ABSENTE du résultat (et non présente
    avec un dict vide) : `.get(holding.id, {})` chez l'appelant redonne alors
    exactement le `{}` que rendait `compute_parts`."""
    holdings = [h for h, _ in holdings_et_valeurs]
    ids = [h.id for h in holdings]
    if not ids:
        return {}

    quotites_par_holding: dict[int, list[tuple[int, float]]] = {}
    for holding_id, detenteur_id, pct in db.query(
        QuotiteHolding.holding_id, QuotiteHolding.detenteur_id, QuotiteHolding.quotite_pct
    ).filter(QuotiteHolding.holding_id.in_(ids)):
        quotites_par_holding.setdefault(holding_id, []).append((detenteur_id, pct))

    emprunts_par_holding: dict[int, list[Loan]] = {}
    for emprunt in db.query(Loan).filter(Loan.holding_id.in_(ids)):
        emprunts_par_holding.setdefault(emprunt.holding_id, []).append(emprunt)

    quotites_par_emprunt: dict[int, list[tuple[int, float]]] = {}
    ids_emprunts = [e.id for lot in emprunts_par_holding.values() for e in lot]
    if ids_emprunts:
        for loan_id, detenteur_id, pct in db.query(
            QuotiteLoan.loan_id, QuotiteLoan.detenteur_id, QuotiteLoan.quotite_pct
        ).filter(QuotiteLoan.loan_id.in_(ids_emprunts)):
            quotites_par_emprunt.setdefault(loan_id, []).append((detenteur_id, pct))

    resultat: dict[int, dict[int, dict[str, float]]] = {}
    for holding, valeur in holdings_et_valeurs:
        quotites_actif = quotites_par_holding.get(holding.id, [])
        if not quotites_actif:
            continue  # aucune quotité saisie : 100 % foyer implicite, comme `compute_parts`

        part_dette_par_detenteur: dict[int, float] = {}
        for emprunt in emprunts_par_holding.get(holding.id, []):
            crd = loan_service.compute_capital_restant_du(emprunt)
            # Même règle de repli que `compute_pourcentage_emprunt` : les quotités
            # propres à l'emprunt priment, sinon celles de l'actif financé.
            quotites_emprunt = quotites_par_emprunt.get(emprunt.id) or quotites_actif
            for detenteur_id, pct in quotites_emprunt:
                part_dette_par_detenteur[detenteur_id] = part_dette_par_detenteur.get(detenteur_id, 0.0) + pct / 100 * crd

        resultat[holding.id] = _assembler_parts(quotites_actif, valeur, part_dette_par_detenteur)
    return resultat


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

    return _assembler_parts([(q.detenteur_id, q.quotite_pct) for q in quotites_actif], valeur, part_dette_par_detenteur)
