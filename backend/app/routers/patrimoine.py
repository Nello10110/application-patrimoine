"""Patrimoine net global (Phase 1 de `docs/ROADMAP.md`) — actifs moins passifs sur
*tout* le patrimoine (portefeuille financier + immobilier/SCPI/assurance-vie/PER),
distinct des écrans d'analyse existants qui restent scopés au seul portefeuille
financier (`services/patrimoine_service.py`).

Simulateur et indépendance financière (Phase 2) : `services/simulation_service.py`,
projeté depuis le patrimoine net actuel calculé ci-dessus — l'utilisateur ne fournit
que ses hypothèses (rendement, épargne, horizon), jamais son patrimoine de départ."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..schemas import FireResponse, PatrimoineNetResponse, SimulationResponse
from ..services import patrimoine_service, simulation_service

router = APIRouter(prefix="/api/patrimoine", tags=["patrimoine"])


@router.get("/net", response_model=PatrimoineNetResponse)
def get_patrimoine_net(db: Session = Depends(get_db)):
    return PatrimoineNetResponse(**patrimoine_service.compute_patrimoine_net(db))


@router.get("/simulation", response_model=SimulationResponse)
def get_simulation(
    rendement_annuel_pct: float = Query(..., ge=-50, le=50),
    epargne_mensuelle: float = Query(..., ge=0),
    annees: int = Query(..., ge=1, le=60),
    db: Session = Depends(get_db),
):
    valeur_depart = patrimoine_service.compute_patrimoine_net(db)["patrimoine_net"]
    points = simulation_service.compute_projection(valeur_depart, rendement_annuel_pct, epargne_mensuelle, annees)
    return SimulationResponse(valeur_depart=round(valeur_depart, 2), points=points)


@router.get("/fire", response_model=FireResponse)
def get_fire(
    rendement_annuel_pct: float = Query(..., ge=-50, le=50),
    epargne_mensuelle: float = Query(..., ge=0),
    depense_annuelle_cible: float = Query(..., gt=0),
    taux_retrait_pct: float = Query(simulation_service.TAUX_RETRAIT_DEFAUT_PCT, gt=0, le=20),
    db: Session = Depends(get_db),
):
    valeur_depart = patrimoine_service.compute_patrimoine_net(db)["patrimoine_net"]
    resultat = simulation_service.compute_fire(
        valeur_depart, rendement_annuel_pct, epargne_mensuelle, depense_annuelle_cible, taux_retrait_pct
    )
    return FireResponse(valeur_depart=round(valeur_depart, 2), **resultat)
