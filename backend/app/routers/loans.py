"""CRUD des emprunts (Phase 1 de `docs/ROADMAP.md`, patrimoine net) — premier vrai
PASSIF de l'application. `capital_restant_du` (dans `LoanOut`) est toujours calculé
côté serveur (`loan_service.compute_capital_restant_du`), jamais côté frontend."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..database import get_db
from ..models import Loan, User
from ..schemas import LoanCreate, LoanOut, LoanUpdate
from ..services import loan_service

router = APIRouter(prefix="/api/loans", tags=["loans"])


def _vers_loan_out(loan: Loan) -> LoanOut:
    out = LoanOut.model_validate(loan)
    out.capital_restant_du = round(loan_service.compute_capital_restant_du(loan), 2)
    return out


@router.get("", response_model=list[LoanOut])
def list_loans(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    loans = db.query(Loan).filter(Loan.user_id == current_user.id).order_by(Loan.libelle).all()
    return [_vers_loan_out(loan) for loan in loans]


@router.post("", response_model=LoanOut)
def create_loan(payload: LoanCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    loan = Loan(**payload.model_dump(), user_id=current_user.id)
    db.add(loan)
    db.commit()
    db.refresh(loan)
    return _vers_loan_out(loan)


@router.patch("/{loan_id}", response_model=LoanOut)
def update_loan(loan_id: int, payload: LoanUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    loan = db.get(Loan, loan_id)
    if loan is None or loan.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Emprunt introuvable")
    updates = payload.model_dump(exclude_unset=True)
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
    return _vers_loan_out(loan)


@router.delete("/{loan_id}")
def delete_loan(loan_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    loan = db.get(Loan, loan_id)
    if loan is None or loan.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Emprunt introuvable")
    db.delete(loan)
    db.commit()
    return {"ok": True}
