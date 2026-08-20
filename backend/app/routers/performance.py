"""Rentabilité globale du portefeuille (snapshot actuel) et son évolution dans le temps."""

import re

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..schemas import DividendeMois, PerformanceSummary, PortfolioHistoryResponse, RapportPeriode
from ..services import historical_performance_service, performance_service, rapport_service

_MOTIF_DATE_ISO = re.compile(r"^\d{4}-\d{2}-\d{2}$")

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


@router.get("/rapport", response_model=RapportPeriode)
def get_rapport_periode(date_debut: str, date_fin: str, db: Session = Depends(get_db)):
    """Rapport récapitulatif sur une période arbitraire (roadmap Phase 4, § D.2 —
    étendu à l'annuel et aux périodes personnalisées), généré à la demande — cf.
    docstring de `rapport_service.compute_rapport_periode`. `date_debut`/`date_fin`
    au format `AAAA-MM-JJ` (bornes inclusives) : le mensuel et l'annuel de l'écran
    ne sont que des raccourcis qui calculent ces bornes côté client avant d'appeler
    ce même endpoint générique."""
    if not _MOTIF_DATE_ISO.match(date_debut) or not _MOTIF_DATE_ISO.match(date_fin):
        raise HTTPException(status_code=400, detail="date_debut et date_fin doivent être au format AAAA-MM-JJ")
    if date_fin < date_debut:
        raise HTTPException(status_code=400, detail="date_fin doit être postérieure ou égale à date_debut")
    return rapport_service.compute_rapport_periode(db, date_debut, date_fin)
