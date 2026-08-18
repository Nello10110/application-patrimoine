"""Portefeuille : import de relevé (mapping manuel de colonnes), CRUD des positions,
fiche détaillée et historique de prix d'une ligne."""

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Holding
from ..schemas import (
    ColumnMapping,
    HoldingCreate,
    HoldingDetail,
    HoldingOut,
    HoldingPriceHistoryResponse,
    HoldingUpdate,
    ImportPreviewResponse,
    ImportResult,
)
from ..services import csv_import, historical_performance_service, holding_detail_service, performance_service

router = APIRouter(prefix="/api/portfolio", tags=["portfolio"])


@router.post("/import/preview", response_model=ImportPreviewResponse)
async def import_preview(file: UploadFile):
    content = await file.read()
    try:
        parsed = csv_import.parse_upload(file.filename or "upload", content)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return ImportPreviewResponse(
        file_token=parsed.token, columns=parsed.columns, rows=parsed.preview_rows, total_rows=parsed.total_rows
    )


def _cellule_texte(row, colonne: str | None) -> str | None:
    """Valeur texte nettoyée d'une cellule optionnelle du fichier importé (`None` si
    la colonne n'est pas mappée ou si la cellule est vide/"nan")."""
    if not colonne:
        return None
    valeur = row.get(colonne)
    if valeur is None:
        return None
    texte = str(valeur).strip()
    return texte if texte and texte.lower() != "nan" else None


@router.post("/import/confirm", response_model=ImportResult)
def import_confirm(mapping: ColumnMapping, db: Session = Depends(get_db)):
    try:
        df = csv_import.get_pending(mapping.file_token)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    if mapping.replace_existing:
        db.query(Holding).delete()

    imported = 0
    skipped = 0
    errors: list[str] = []

    for idx, row in df.iterrows():
        ticker = (_cellule_texte(row, mapping.ticker_col) or "").upper()
        qty_val = csv_import.to_float(row.get(mapping.quantite_col))

        if not ticker or qty_val is None:
            skipped += 1
            errors.append(f"Ligne {idx + 2}: ticker ou quantité invalide")
            continue

        db.add(
            Holding(
                ticker=ticker,
                nom=_cellule_texte(row, mapping.nom_col),
                quantite=qty_val,
                prix_revient_moyen=csv_import.to_float(row.get(mapping.prix_revient_col)) if mapping.prix_revient_col else None,
                compte=_cellule_texte(row, mapping.compte_col),
                devise=_cellule_texte(row, mapping.devise_col),
            )
        )
        imported += 1

    db.commit()
    csv_import.clear_pending(mapping.file_token)

    return ImportResult(imported=imported, skipped=skipped, errors=errors)


@router.get("/holdings", response_model=list[HoldingOut])
def list_holdings(db: Session = Depends(get_db)):
    holdings = db.query(Holding).order_by(Holding.ticker).all()
    rendements = performance_service.compute_holding_returns(db)
    result = []
    for h in holdings:
        out = HoldingOut.model_validate(h)
        r = rendements.get(h.ticker, {})
        out.rendement_depuis_achat_pct = r.get("rendement_depuis_achat_pct")
        out.rendement_annualise_pct = r.get("rendement_annualise_pct")
        result.append(out)
    return result


@router.get("/holdings/{ticker}/detail", response_model=HoldingDetail)
def get_holding_detail(ticker: str, db: Session = Depends(get_db)):
    detail = holding_detail_service.build_holding_detail(db, ticker)
    if detail is None:
        raise HTTPException(status_code=404, detail="Ligne introuvable")
    return HoldingDetail(**detail)


@router.get("/holdings/{ticker}/price-history", response_model=HoldingPriceHistoryResponse)
def get_holding_price_history(ticker: str, db: Session = Depends(get_db)):
    result = historical_performance_service.compute_holding_price_history(db, ticker)
    return HoldingPriceHistoryResponse(**result) if result else HoldingPriceHistoryResponse(points=[])


@router.post("/holdings", response_model=HoldingOut)
def create_holding(payload: HoldingCreate, db: Session = Depends(get_db)):
    holding = Holding(**payload.model_dump())
    holding.ticker = holding.ticker.strip().upper()
    db.add(holding)
    db.commit()
    db.refresh(holding)
    return holding


@router.patch("/holdings/{holding_id}", response_model=HoldingOut)
def update_holding(holding_id: int, payload: HoldingUpdate, db: Session = Depends(get_db)):
    holding = db.get(Holding, holding_id)
    if holding is None:
        raise HTTPException(status_code=404, detail="Ligne introuvable")
    updates = payload.model_dump(exclude_unset=True)
    if "ticker" in updates and updates["ticker"]:
        updates["ticker"] = updates["ticker"].strip().upper()
    for key, value in updates.items():
        setattr(holding, key, value)
    db.commit()
    db.refresh(holding)
    return holding


@router.delete("/holdings/{holding_id}")
def delete_holding(holding_id: int, db: Session = Depends(get_db)):
    holding = db.get(Holding, holding_id)
    if holding is None:
        raise HTTPException(status_code=404, detail="Ligne introuvable")
    db.delete(holding)
    db.commit()
    return {"ok": True}
