"""Rafraîchissement des cours/composition ETF via yfinance (en tâche de fond,
LOT 4B) et lecture du cache."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Holding, MarketDataCache
from ..schemas import EtatRafraichissement, MarketDataOut
from ..services import market_data_service

router = APIRouter(prefix="/api/market-data", tags=["market-data"])


@router.post("/refresh", response_model=EtatRafraichissement, status_code=202)
def refresh(db: Session = Depends(get_db)):
    """Démarre un rafraîchissement en tâche de fond et renvoie tout de suite l'état
    de démarrage (202, LOT 4.7/4B) — plus la liste complète du cache comme avant :
    sur le portefeuille réel de l'utilisateur, un rafraîchissement complet dépasse
    largement la minute, et le frontend rappelle de toute façon `listHoldings()`
    juste après. Le frontend suit la progression via `GET /refresh/status`.

    Délai minimal entre deux rafraîchissements manuels (LOT 7.5, inchangé) : le
    rafraîchissement planifié (`scheduler_service`) appelle directement
    `market_data_service.refresh_tickers`, sans passer par cette route, et n'est
    donc pas concerné. `409` en complément si un rafraîchissement (déclenché depuis
    cette route ou depuis `POST /api/settings/jobs/{job_key}/run-now`) est déjà en
    cours — le garde-fou de fréquence n'empêche pas ce cas, un rafraîchissement
    pouvant encore tourner plus de `DELAI_MINIMAL_ENTRE_RAFRAICHISSEMENTS_SECONDES`
    après son déclenchement."""
    try:
        market_data_service.verifier_et_enregistrer_rafraichissement_manuel()
    except market_data_service.RafraichissementTropFrequentError as exc:
        raise HTTPException(status_code=429, detail=str(exc)) from exc

    items = [(row[0], row[1]) for row in db.query(Holding.ticker, Holding.type_actif).distinct().all()]
    try:
        return market_data_service.demarrer_rafraichissement(items)
    except market_data_service.RafraichissementDejaEnCoursError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.get("/refresh/status", response_model=EtatRafraichissement)
def refresh_status():
    return market_data_service.etat_rafraichissement()


@router.get("", response_model=list[MarketDataOut])
def list_market_data(db: Session = Depends(get_db)):
    return db.query(MarketDataCache).all()
