"""Patrimoine net global (Phase 1 de `docs/ROADMAP.md`) — actifs moins passifs sur
*tout* le patrimoine (portefeuille financier + immobilier/SCPI/assurance-vie/PER),
distinct des écrans d'analyse existants qui restent scopés au seul portefeuille
financier (`services/patrimoine_service.py`)."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..database import get_db
from ..schemas import PatrimoineNetResponse
from ..services import patrimoine_service

router = APIRouter(prefix="/api/patrimoine", tags=["patrimoine"])


@router.get("/net", response_model=PatrimoineNetResponse)
def get_patrimoine_net(db: Session = Depends(get_db)):
    return PatrimoineNetResponse(**patrimoine_service.compute_patrimoine_net(db))
