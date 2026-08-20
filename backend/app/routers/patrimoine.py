"""Patrimoine net global (Phase 1 de `docs/ROADMAP.md`) — actifs moins passifs sur
*tout* le patrimoine (portefeuille financier + immobilier/SCPI/assurance-vie/PER),
distinct des écrans d'analyse existants qui restent scopés au seul portefeuille
financier (`services/patrimoine_service.py`).

Sert aussi de capital de départ par défaut à l'écran Simulateur (fusion
Simulateur/Outils) : la projection, le tableau de détail et le calcul FIRE sont
calculés côté client (`frontend/src/utils/interetsComposes.ts`) — ce module
n'expose donc plus que le patrimoine net lui-même, plus d'endpoint
`/simulation`/`/fire` dédié."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..database import get_db
from ..models import User
from ..schemas import PatrimoineNetResponse
from ..services import patrimoine_service

router = APIRouter(prefix="/api/patrimoine", tags=["patrimoine"])


@router.get("/net", response_model=PatrimoineNetResponse)
def get_patrimoine_net(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return PatrimoineNetResponse(**patrimoine_service.compute_patrimoine_net(db, current_user.id))
