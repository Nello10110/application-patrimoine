"""Import du grand livre de transactions (format Trade Republic) et reconstruction
du portefeuille qui en découle.

Import en deux temps depuis le redesign du 03/09/2026 (demande directe de
l'utilisateur : « il faut qu'à l'import il me demande et remplisse
l'établissement ») — même patron que l'import de relevé de positions
(`routers/portfolio.py::import_preview`/`import_confirm`) : `/import/apercu`
parse le fichier et compte les lignes par bucket de compte suggéré
(`transaction_import.cle_compte`), `/import` crée les comptes nécessaires sous
l'établissement choisi puis importe."""

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..database import get_db
from ..models import Compte, Etablissement, Transaction, User
from ..schemas import TransactionImportApercu, TransactionImportConfirm, TransactionImportResult
from ..services import auth_service, comptes_service, portfolio_reconstruction, transaction_import, upload_limits

router = APIRouter(prefix="/api/transactions", tags=["transactions"])


@router.post("/import/apercu", response_model=TransactionImportApercu)
async def import_apercu(file: UploadFile, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    content = await file.read()
    try:
        upload_limits.verifier_taille_fichier(content)
    except upload_limits.FichierTropVolumineuxError as exc:
        raise HTTPException(status_code=413, detail=str(exc)) from exc
    try:
        parsed = transaction_import.parse_transactions_file(content)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    token = transaction_import.stage_parsed(parsed)
    comptages = {cle: n for cle, n in parsed.lignes_par_cle_compte.items() if n > 0}
    noms_par_defaut = {cle: transaction_import.NOMS_COMPTE_PAR_DEFAUT[cle] for cle in comptages}
    etablissements = comptes_service.list_etablissements(db, auth_service.id_foyer(current_user))

    return TransactionImportApercu(
        file_token=token,
        lignes_lues=parsed.lignes_lues,
        mouvements_hors_bourse_exclus=parsed.mouvements_hors_bourse_exclus,
        comptages=comptages,
        noms_par_defaut=noms_par_defaut,
        etablissements=etablissements,
    )


@router.post("/import", response_model=TransactionImportResult)
def import_transactions(payload: TransactionImportConfirm, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    user_id = auth_service.id_foyer(current_user)
    try:
        parsed = transaction_import.get_pending_transactions(payload.file_token)
    except KeyError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if payload.etablissement_id is not None:
        etablissement = db.get(Etablissement, payload.etablissement_id)
        if etablissement is None or etablissement.user_id != user_id:
            raise HTTPException(status_code=404, detail="Établissement introuvable")
        etablissement_id = payload.etablissement_id
    else:
        etablissement_id = comptes_service.get_or_create_etablissement(db, user_id, payload.etablissement_nom).id

    # Un seul `Compte` créé par clé EFFECTIVEMENT présente dans le fichier (jamais les
    # 4 par défaut) — `get_or_create_compte_sans_commit` ne recrée jamais un compte
    # déjà existant sous ce nom (ré-import), et ne touche jamais son établissement
    # actuel si déjà créé par un import précédent.
    comptes_par_cle: dict[str, int] = {}
    comptes_crees = 0
    for cle, nb_lignes in parsed.lignes_par_cle_compte.items():
        if nb_lignes <= 0:
            continue
        nom = payload.noms_comptes.get(cle) or transaction_import.NOMS_COMPTE_PAR_DEFAUT[cle]
        existait_deja = db.query(Compte).filter(Compte.user_id == user_id, Compte.nom == nom).first() is not None
        compte = comptes_service.get_or_create_compte_sans_commit(db, user_id, nom, etablissement_id)
        comptes_par_cle[cle] = compte.id
        if not existait_deja:
            comptes_crees += 1

    comptes_a_assigner = {
        symbol: comptes_par_cle[cle] for symbol, cle in parsed.cle_compte_par_ticker.items() if cle in comptes_par_cle
    }

    # Dédoublonnage scopé à l'utilisateur (Milestone 2a) : le transaction_id est émis
    # par le courtier, pas garanti unique entre deux comptes courtier différents —
    # sans ce filtre, l'import de l'un pourrait ignorer à tort une transaction parce
    # qu'un AUTRE utilisateur a, par coïncidence, le même identifiant.
    existing_ids = {row[0] for row in db.query(Transaction.transaction_id).filter(Transaction.user_id == user_id).all()}

    doublons = 0
    importees = 0
    for row in parsed.rows:
        if row["transaction_id"] in existing_ids:
            doublons += 1
            continue
        db.add(Transaction(**row, user_id=user_id))
        existing_ids.add(row["transaction_id"])
        importees += 1

    db.commit()
    transaction_import.clear_pending_transactions(payload.file_token)

    resultat_reconstruction = portfolio_reconstruction.rebuild_holdings(db, user_id, comptes_a_assigner=comptes_a_assigner)

    return TransactionImportResult(
        lignes_lues=parsed.lignes_lues,
        importees=importees,
        doublons_ignores=doublons,
        mouvements_hors_bourse_exclus=parsed.mouvements_hors_bourse_exclus,
        positions_recalculees=resultat_reconstruction.positions_recalculees,
        anomalies_detectees=resultat_reconstruction.anomalies_detectees,
        lignes_manuelles_remplacees=resultat_reconstruction.lignes_manuelles_remplacees,
        comptes_crees=comptes_crees,
    )


@router.post("/reconstruct")
def reconstruct(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    resultat = portfolio_reconstruction.rebuild_holdings(db, auth_service.id_foyer(current_user))
    return {
        "positions_recalculees": resultat.positions_recalculees,
        "anomalies_detectees": resultat.anomalies_detectees,
        "lignes_manuelles_remplacees": resultat.lignes_manuelles_remplacees,
    }


@router.get("/count")
def count(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Diagnostic (non utilisé par l'interface) : nombre de transactions en base,
    utile pour vérifier un import depuis les outils d'exploitation (cf. MANUEL_EXPLOITATION.md)."""
    return {"total": db.query(Transaction).filter(Transaction.user_id == auth_service.id_foyer(current_user)).count()}
