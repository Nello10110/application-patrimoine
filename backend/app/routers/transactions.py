"""Import du grand livre de transactions (format Trade Republic) et reconstruction
du portefeuille qui en découle."""

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..database import get_db
from ..models import Transaction, User
from ..schemas import TransactionImportResult
from ..services import portfolio_reconstruction, transaction_import, upload_limits

router = APIRouter(prefix="/api/transactions", tags=["transactions"])


@router.post("/import", response_model=TransactionImportResult)
async def import_transactions(file: UploadFile, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    content = await file.read()
    try:
        upload_limits.verifier_taille_fichier(content)
    except upload_limits.FichierTropVolumineuxError as exc:
        raise HTTPException(status_code=413, detail=str(exc)) from exc
    try:
        parsed = transaction_import.parse_transactions_file(content)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    # Dédoublonnage scopé à l'utilisateur (Milestone 2a) : le transaction_id est émis
    # par le courtier, pas garanti unique entre deux comptes courtier différents —
    # sans ce filtre, l'import de l'un pourrait ignorer à tort une transaction parce
    # qu'un AUTRE utilisateur a, par coïncidence, le même identifiant.
    existing_ids = {
        row[0] for row in db.query(Transaction.transaction_id).filter(Transaction.user_id == current_user.id).all()
    }

    doublons = 0
    importees = 0
    for row in parsed.rows:
        if row["transaction_id"] in existing_ids:
            doublons += 1
            continue
        db.add(Transaction(**row, user_id=current_user.id))
        existing_ids.add(row["transaction_id"])
        importees += 1

    db.commit()

    resultat_reconstruction = portfolio_reconstruction.rebuild_holdings(db, current_user.id)

    return TransactionImportResult(
        lignes_lues=parsed.lignes_lues,
        importees=importees,
        doublons_ignores=doublons,
        mouvements_hors_bourse_exclus=parsed.mouvements_hors_bourse_exclus,
        positions_recalculees=resultat_reconstruction.positions_recalculees,
        anomalies_detectees=resultat_reconstruction.anomalies_detectees,
        lignes_manuelles_remplacees=resultat_reconstruction.lignes_manuelles_remplacees,
    )


@router.post("/reconstruct")
def reconstruct(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    resultat = portfolio_reconstruction.rebuild_holdings(db, current_user.id)
    return {
        "positions_recalculees": resultat.positions_recalculees,
        "anomalies_detectees": resultat.anomalies_detectees,
        "lignes_manuelles_remplacees": resultat.lignes_manuelles_remplacees,
    }


@router.get("/count")
def count(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Diagnostic (non utilisé par l'interface) : nombre de transactions en base,
    utile pour vérifier un import depuis les outils d'exploitation (cf. MANUEL_EXPLOITATION.md)."""
    return {"total": db.query(Transaction).filter(Transaction.user_id == current_user.id).count()}
