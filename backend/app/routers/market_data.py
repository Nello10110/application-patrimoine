"""Rafraîchissement des cours/composition ETF via yfinance et lecture du cache."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Holding, MarketDataCache
from ..schemas import MarketDataOut
from ..services import market_data_service

router = APIRouter(prefix="/api/market-data", tags=["market-data"])


@router.post("/refresh", response_model=list[MarketDataOut])
def refresh(db: Session = Depends(get_db)):
    # Délai minimal entre deux rafraîchissements manuels (LOT 7.5) : le
    # rafraîchissement planifié (`scheduler_service`) appelle directement
    # `refresh_tickers`, sans passer par cette route, et n'est donc pas concerné.
    try:
        market_data_service.verifier_et_enregistrer_rafraichissement_manuel()
    except market_data_service.RafraichissementTropFrequentError as exc:
        raise HTTPException(status_code=429, detail=str(exc)) from exc

    items = [(row[0], row[1]) for row in db.query(Holding.ticker, Holding.type_actif).distinct().all()]
    market_data_service.refresh_tickers(db, items)
    return db.query(MarketDataCache).all()


@router.get("", response_model=list[MarketDataOut])
def list_market_data(db: Session = Depends(get_db)):
    return db.query(MarketDataCache).all()
