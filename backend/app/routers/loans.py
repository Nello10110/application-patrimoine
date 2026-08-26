"""CRUD des emprunts (Phase 1 de `docs/ROADMAP.md`, patrimoine net) — premier vrai
PASSIF de l'application. `capital_restant_du` (dans `LoanOut`) est toujours calculé
côté serveur (`loan_service.compute_capital_restant_du`), jamais côté frontend."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..auth import get_current_user, require_role
from ..database import get_db
from ..models import Holding, Loan, QuotiteHolding, QuotiteLoan, ROLE_INVITE, ROLE_MEMBRE, ROLE_PROPRIETAIRE, User
from ..schemas import LoanCreate, LoanOut, LoanUpdate
from ..services import auth_service, detenteurs_service, historique_cache, loan_service

router = APIRouter(prefix="/api/loans", tags=["loans"])

_peut_ecrire = require_role(ROLE_PROPRIETAIRE, ROLE_MEMBRE)


def _vers_loan_out(loan: Loan) -> LoanOut:
    out = LoanOut.model_validate(loan)
    out.capital_restant_du = round(loan_service.compute_capital_restant_du(loan), 2)
    return out


@router.get("", response_model=list[LoanOut])
def list_loans(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    requete = db.query(Loan).filter(Loan.user_id == auth_service.id_foyer(current_user))
    if current_user.role == ROLE_INVITE:
        # Visible pour un invité (2.L.2) : quotité d'emprunt explicite sur son
        # périmètre, OU emprunt rattaché à un actif dont il détient une quotité
        # (même règle d'héritage que `detenteurs_service.compute_parts`).
        perimetre = detenteurs_service.perimetre_invite(db, current_user.id)
        if not perimetre:
            return []
        loans_directs = {
            row[0]
            for row in db.query(QuotiteLoan.loan_id).filter(QuotiteLoan.detenteur_id.in_(perimetre), QuotiteLoan.quotite_pct > 0).all()
        }
        holdings_visibles = {
            row[0]
            for row in db.query(QuotiteHolding.holding_id)
            .filter(QuotiteHolding.detenteur_id.in_(perimetre), QuotiteHolding.quotite_pct > 0)
            .all()
        }
        loans_herites = {
            row[0] for row in db.query(Loan.id).filter(Loan.holding_id.in_(holdings_visibles or [-1])).all()
        }
        ids_visibles = loans_directs | loans_herites
        requete = requete.filter(Loan.id.in_(ids_visibles or [-1]))
    loans = requete.order_by(Loan.libelle).all()
    return [_vers_loan_out(loan) for loan in loans]


@router.post("", response_model=LoanOut)
def create_loan(payload: LoanCreate, db: Session = Depends(get_db), current_user: User = Depends(_peut_ecrire)):
    loan = Loan(**payload.model_dump(), user_id=auth_service.id_foyer(current_user))
    db.add(loan)
    db.commit()
    db.refresh(loan)
    historique_cache.invalider_historiques_patrimoine(db)
    return _vers_loan_out(loan)


@router.patch("/{loan_id}", response_model=LoanOut)
def update_loan(loan_id: int, payload: LoanUpdate, db: Session = Depends(get_db), current_user: User = Depends(_peut_ecrire)):
    loan = db.get(Loan, loan_id)
    if loan is None or loan.user_id != auth_service.id_foyer(current_user):
        raise HTTPException(status_code=404, detail="Emprunt introuvable")
    updates = payload.model_dump(exclude_unset=True)
    # Rattachement à un actif (backlog 2.M.2) : vérifie que l'actif visé appartient
    # bien à l'utilisateur courant (IDOR) — `None` (dérattachement) ne nécessite pas
    # cette vérification.
    if "holding_id" in updates and updates["holding_id"] is not None:
        cible = db.get(Holding, updates["holding_id"])
        if cible is None or cible.user_id != auth_service.id_foyer(current_user):
            raise HTTPException(status_code=404, detail="Actif introuvable")
    # Un recalage manuel du capital restant dû (relevé bancaire réel) horodate
    # `derniere_maj_manuelle` — même logique que `Holding.date_valeur_estimee`
    # (`routers/portfolio.py`) : seul un changement réel du champ concerné avance la
    # date, jamais une mise à jour d'un autre champ (libellé, taux...).
    if "capital_restant_du_manuel" in updates:
        loan.derniere_maj_manuelle = loan_service.maintenant_naif()
    for key, value in updates.items():
        setattr(loan, key, value)
    db.commit()
    db.refresh(loan)
    historique_cache.invalider_historiques_patrimoine(db)
    return _vers_loan_out(loan)


@router.delete("/{loan_id}")
def delete_loan(loan_id: int, db: Session = Depends(get_db), current_user: User = Depends(_peut_ecrire)):
    loan = db.get(Loan, loan_id)
    if loan is None or loan.user_id != auth_service.id_foyer(current_user):
        raise HTTPException(status_code=404, detail="Emprunt introuvable")
    db.delete(loan)
    db.commit()
    historique_cache.invalider_historiques_patrimoine(db)
    return {"ok": True}
