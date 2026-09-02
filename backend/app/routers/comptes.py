"""CRUD des établissements/comptes structurels et solde par compte (écran Comptes,
backlog X.1) — remplace l'ancienne annotation texte libre `Holding.compte`."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..auth import get_current_user, require_role
from ..database import get_db
from ..models import ROLE_INVITE, ROLE_MEMBRE, ROLE_PROPRIETAIRE, Compte, Etablissement, Holding, QuotiteHolding, User
from ..schemas import (
    CompteAvecSoldeOut,
    CompteCreate,
    CompteOut,
    CompteUpdate,
    EtablissementCreate,
    EtablissementOut,
    EtablissementUpdate,
    HoldingOut,
    QuotitesUpdate,
)
from ..services import analysis_service, auth_service, comptes_service, detenteurs_service, historique_cache

router = APIRouter(prefix="/api/comptes", tags=["comptes"])

_peut_ecrire = require_role(ROLE_PROPRIETAIRE, ROLE_MEMBRE)


def _holdings_visibles_ids_invite(db: Session, current_user: User) -> set[int] | None:
    """`None` pour propriétaire/membre (pas de filtre) ; pour un invité (2.L.2), les
    ids des lignes où l'un de ses détenteurs assignés a une quotité positive — même
    règle que `routers/portfolio.py::_holdings_visibles`, dupliquée ici (pattern déjà
    en place entre `portfolio.py`/`loans.py`, chaque routeur porte sa propre
    variante plutôt que d'importer une fonction privée d'un autre module)."""
    if current_user.role != ROLE_INVITE:
        return None
    perimetre = detenteurs_service.perimetre_invite(db, current_user.id)
    if not perimetre:
        return set()
    return {
        row[0]
        for row in db.query(QuotiteHolding.holding_id)
        .filter(QuotiteHolding.detenteur_id.in_(perimetre), QuotiteHolding.quotite_pct > 0)
        .all()
    }


# --- Établissements -----------------------------------------------------------


@router.get("/etablissements", response_model=list[EtablissementOut])
def list_etablissements(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return comptes_service.list_etablissements(db, auth_service.id_foyer(current_user))


@router.post("/etablissements", response_model=EtablissementOut)
def create_etablissement(payload: EtablissementCreate, db: Session = Depends(get_db), current_user: User = Depends(_peut_ecrire)):
    try:
        return comptes_service.create_etablissement(db, auth_service.id_foyer(current_user), payload.nom)
    except ValueError as exc:
        # Doublon de nom : message exploitable plutôt qu'une `IntegrityError` brute
        # en 500 (recette du 02/09/2026), même contrat que `set_compte_quotites`.
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.patch("/etablissements/{etablissement_id}", response_model=EtablissementOut)
def update_etablissement(
    etablissement_id: int,
    payload: EtablissementUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(_peut_ecrire),
):
    etablissement = db.get(Etablissement, etablissement_id)
    if etablissement is None or etablissement.user_id != auth_service.id_foyer(current_user):
        raise HTTPException(status_code=404, detail="Établissement introuvable")
    try:
        return comptes_service.update_etablissement(db, etablissement, **payload.model_dump(exclude_unset=True))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.delete("/etablissements/{etablissement_id}")
def delete_etablissement(etablissement_id: int, db: Session = Depends(get_db), current_user: User = Depends(_peut_ecrire)):
    etablissement = db.get(Etablissement, etablissement_id)
    if etablissement is None or etablissement.user_id != auth_service.id_foyer(current_user):
        raise HTTPException(status_code=404, detail="Établissement introuvable")
    comptes_service.delete_etablissement(db, etablissement)
    return {"ok": True}


# --- Comptes --------------------------------------------------------------------


@router.get("", response_model=list[CompteOut])
def list_comptes(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return comptes_service.list_comptes(db, auth_service.id_foyer(current_user))


@router.post("", response_model=CompteOut)
def create_compte(payload: CompteCreate, db: Session = Depends(get_db), current_user: User = Depends(_peut_ecrire)):
    user_id = auth_service.id_foyer(current_user)
    if payload.etablissement_id is not None:
        etablissement = db.get(Etablissement, payload.etablissement_id)
        if etablissement is None or etablissement.user_id != user_id:
            raise HTTPException(status_code=404, detail="Établissement introuvable")
    try:
        return comptes_service.create_compte(db, user_id, payload.nom, payload.etablissement_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.patch("/{compte_id}", response_model=CompteOut)
def update_compte(compte_id: int, payload: CompteUpdate, db: Session = Depends(get_db), current_user: User = Depends(_peut_ecrire)):
    user_id = auth_service.id_foyer(current_user)
    compte = db.get(Compte, compte_id)
    if compte is None or compte.user_id != user_id:
        raise HTTPException(status_code=404, detail="Compte introuvable")
    updates = payload.model_dump(exclude_unset=True)
    if updates.get("etablissement_id") is not None:
        etablissement = db.get(Etablissement, updates["etablissement_id"])
        if etablissement is None or etablissement.user_id != user_id:
            raise HTTPException(status_code=404, detail="Établissement introuvable")
    try:
        return comptes_service.update_compte(db, compte, **updates)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.delete("/{compte_id}")
def delete_compte(compte_id: int, db: Session = Depends(get_db), current_user: User = Depends(_peut_ecrire)):
    compte = db.get(Compte, compte_id)
    if compte is None or compte.user_id != auth_service.id_foyer(current_user):
        raise HTTPException(status_code=404, detail="Compte introuvable")
    comptes_service.delete_compte(db, compte)
    return {"ok": True}


@router.get("/solde", response_model=list[CompteAvecSoldeOut])
def get_soldes(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    holdings_visibles_ids = _holdings_visibles_ids_invite(db, current_user)
    resultats = comptes_service.solde_par_compte(db, auth_service.id_foyer(current_user), holdings_visibles_ids)
    return [
        CompteAvecSoldeOut(
            compte=CompteOut.model_validate(r["compte"]) if r["compte"] is not None else None,
            solde=round(r["solde"], 2),
            nombre_lignes=r["nombre_lignes"],
        )
        for r in resultats
    ]


@router.get("/{compte_id}/holdings", response_model=list[HoldingOut])
def get_compte_holdings(compte_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    user_id = auth_service.id_foyer(current_user)
    compte = db.get(Compte, compte_id)
    if compte is None or compte.user_id != user_id:
        raise HTTPException(status_code=404, detail="Compte introuvable")
    holdings_visibles_ids = _holdings_visibles_ids_invite(db, current_user)
    requete = db.query(Holding).filter(Holding.compte_id == compte_id, Holding.user_id == user_id)
    if holdings_visibles_ids is not None:
        requete = requete.filter(Holding.id.in_(holdings_visibles_ids or [-1]))
    holdings = requete.order_by(Holding.ticker).all()
    valued = {v.holding.id: v.valeur for v in analysis_service.value_holdings(holdings)}
    resultats = []
    for h in holdings:
        out = HoldingOut.model_validate(h)
        out.valeur = valued.get(h.id)
        resultats.append(out)
    return resultats


@router.put("/{compte_id}/quotites")
def set_compte_quotites(compte_id: int, payload: QuotitesUpdate, db: Session = Depends(get_db), current_user: User = Depends(_peut_ecrire)):
    """Remplace intégralement la répartition (quotités) de CHAQUE ligne rattachée à
    ce compte entre détenteurs — cf. `comptes_service.set_quotites_compte`. Une
    liste vide retire toute répartition (retombe à 100 % foyer implicite sur
    chaque ligne)."""
    user_id = auth_service.id_foyer(current_user)
    compte = db.get(Compte, compte_id)
    if compte is None or compte.user_id != user_id:
        raise HTTPException(status_code=404, detail="Compte introuvable")
    try:
        comptes_service.set_quotites_compte(db, user_id, compte, [(q.detenteur_id, q.quotite_pct) for q in payload.quotites])
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    historique_cache.invalider_historiques_patrimoine(db)
    return {"ok": True}
