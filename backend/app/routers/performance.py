"""Rentabilité globale du portefeuille (snapshot actuel) et son évolution dans le temps."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..schemas import DividendeMois, PerformanceSummary, PortfolioHistoryResponse, RapportMensuel
from ..services import historical_performance_service, performance_service, rapport_service

router = APIRouter(prefix="/api/performance", tags=["performance"])


@router.get("", response_model=PerformanceSummary)
def get_performance(db: Session = Depends(get_db)):
    return performance_service.compute_performance(db)


@router.get("/history", response_model=PortfolioHistoryResponse)
def get_portfolio_history(db: Session = Depends(get_db)):
    points = historical_performance_service.compute_portfolio_history(db)
    return PortfolioHistoryResponse(points=points)


@router.get("/dividendes", response_model=list[DividendeMois])
def get_dividend_calendar(db: Session = Depends(get_db)):
    """Calendrier des dividendes perçus, mois par mois (roadmap Phase 3, § C.1)."""
    return performance_service.compute_dividend_calendar(db)


@router.get("/rapport", response_model=RapportMensuel)
def get_rapport_mensuel(annee: int, mois: int, db: Session = Depends(get_db)):
    """Rapport récapitulatif d'un mois donné (roadmap Phase 4, § D.2), généré à la
    demande — cf. docstring de `rapport_service.compute_rapport_mensuel`."""
    if not 1 <= mois <= 12:
        raise HTTPException(status_code=400, detail="mois doit être entre 1 et 12")
    return rapport_service.compute_rapport_mensuel(db, annee, mois)
