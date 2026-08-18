"""Import du grand livre de transactions (format Trade Republic) et reconstruction
du portefeuille qui en découle."""

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Transaction
from ..schemas import TransactionImportResult
from ..services import portfolio_reconstruction, transaction_import

router = APIRouter(prefix="/api/transactions", tags=["transactions"])


@router.post("/import", response_model=TransactionImportResult)
async def import_transactions(file: UploadFile, db: Session = Depends(get_db)):
    content = await file.read()
    try:
        parsed = transaction_import.parse_transactions_file(content)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    existing_ids = {row[0] for row in db.query(Transaction.transaction_id).all()}

    doublons = 0
    importees = 0
    for row in parsed.rows:
        if row["transaction_id"] in existing_ids:
            doublons += 1
            continue
        db.add(Transaction(**row))
        existing_ids.add(row["transaction_id"])
        importees += 1

    db.commit()

    positions_recalculees = portfolio_reconstruction.rebuild_holdings(db)

    return TransactionImportResult(
        lignes_lues=parsed.lignes_lues,
        importees=importees,
        doublons_ignores=doublons,
        mouvements_hors_bourse_exclus=parsed.mouvements_hors_bourse_exclus,
        positions_recalculees=positions_recalculees,
    )


@router.post("/reconstruct")
def reconstruct(db: Session = Depends(get_db)):
    positions_recalculees = portfolio_reconstruction.rebuild_holdings(db)
    return {"positions_recalculees": positions_recalculees}


@router.get("/count")
def count(db: Session = Depends(get_db)):
    """Diagnostic (non utilisé par l'interface) : nombre de transactions en base,
    utile pour vérifier un import depuis les outils d'exploitation (cf. MANUEL_EXPLOITATION.md)."""
    return {"total": db.query(Transaction).count()}
