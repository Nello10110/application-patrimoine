"""Rentabilité globale du portefeuille (snapshot actuel) et son évolution dans le temps."""

import re

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..database import get_db
from ..models import User
from ..schemas import (
    BenchmarkOption,
    ComparaisonBenchmark,
    DividendeMois,
    MetriquesAvancees,
    PerformanceSummary,
    PortfolioHistoryResponse,
    RapportPeriode,
    RevenusPassifsProjetes,
)
from ..services import (
    auth_service,
    historical_performance_service,
    metriques_performance_service,
    performance_service,
    rapport_service,
    revenus_passifs_service,
)

_MOTIF_DATE_ISO = re.compile(r"^\d{4}-\d{2}-\d{2}$")

router = APIRouter(prefix="/api/performance", tags=["performance"])


@router.get("", response_model=PerformanceSummary)
def get_performance(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return performance_service.compute_performance(db, auth_service.id_foyer(current_user))


@router.get("/history", response_model=PortfolioHistoryResponse)
def get_portfolio_history(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    points = historical_performance_service.compute_portfolio_history(db, auth_service.id_foyer(current_user))
    return PortfolioHistoryResponse(points=points)


@router.get("/metriques-avancees", response_model=MetriquesAvancees)
def get_metriques_avancees(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """TWR, volatilité annualisée, max drawdown et récupération (backlog 2.P.2) —
    calculées sur la même série que `/history`, jamais un second calcul de fond."""
    points = historical_performance_service.compute_portfolio_history(db, auth_service.id_foyer(current_user))
    return metriques_performance_service.compute_metriques_avancees(points)


@router.get("/benchmarks", response_model=list[BenchmarkOption])
def list_benchmarks():
    """Liste fermée d'indices de référence proposés (backlog 2.P.2) — jamais un
    ticker arbitraire saisi par l'utilisateur."""
    return [
        BenchmarkOption(key=key, label=b["label"]) for key, b in historical_performance_service.BENCHMARKS.items()
    ]


@router.get("/comparaison-benchmark", response_model=ComparaisonBenchmark)
def get_comparaison_benchmark(
    benchmark: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    points = historical_performance_service.compute_portfolio_history(db, auth_service.id_foyer(current_user))
    resultat = historical_performance_service.compute_benchmark_history(db, benchmark, points)
    if resultat is None:
        raise HTTPException(status_code=404, detail="Indice de référence inconnu, ou aucune donnée disponible pour cette période.")
    return resultat


@router.get("/revenus-passifs", response_model=RevenusPassifsProjetes)
def get_revenus_passifs(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Revenus passifs projetés à 12 mois (backlog 2.P.3, absorbe C.2) — certain
    (loyers nets, intérêts de livrets) vs estimé (dividendes/intérêts de courtage,
    extrapolés depuis les 12 derniers mois réellement perçus)."""
    return revenus_passifs_service.compute_revenus_passifs(db, auth_service.id_foyer(current_user))


@router.get("/dividendes", response_model=list[DividendeMois])
def get_dividend_calendar(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Calendrier des dividendes perçus, mois par mois (roadmap Phase 3, § C.1)."""
    return performance_service.compute_dividend_calendar(db, auth_service.id_foyer(current_user))


@router.get("/rapport", response_model=RapportPeriode)
def get_rapport_periode(
    date_debut: str, date_fin: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
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
    return rapport_service.compute_rapport_periode(db, date_debut, date_fin, auth_service.id_foyer(current_user))
