"""Rentabilité globale du portefeuille (snapshot actuel) et son évolution dans le temps."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..database import get_db
from ..schemas import PerformanceSummary, PortfolioHistoryResponse
from ..services import historical_performance_service, performance_service

router = APIRouter(prefix="/api/performance", tags=["performance"])


@router.get("", response_model=PerformanceSummary)
def get_performance(db: Session = Depends(get_db)):
    return performance_service.compute_performance(db)


@router.get("/history", response_model=PortfolioHistoryResponse)
def get_portfolio_history(db: Session = Depends(get_db)):
    points = historical_performance_service.compute_portfolio_history(db)
    return PortfolioHistoryResponse(points=points)
