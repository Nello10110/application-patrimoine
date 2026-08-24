"""Budget (backlog 2.N.1/2.N.2) : import de mouvements bancaires (CSV mappé, OFX,
QIF), catégories et règles de catégorisation, écran Budget (indicateurs, répartition,
budget cible). Routeur enregistré `_pas_invite` dans `main.py` : le budget ne fait
pas partie des trois écrans ouverts à l'invité (backlog 2.L.2)."""

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..database import get_db
from ..models import User
from ..schemas import (
    BudgetCibleOut,
    BudgetCibleUpdate,
    BudgetColumnMapping,
    BudgetImportResult,
    BudgetSummary,
    CategorieBudgetCreate,
    CategorieBudgetOut,
    CategorieBudgetUpdate,
    ImportPreviewResponse,
    JonctionPatrimoine,
    MouvementBancaireOut,
    MouvementCategorisationUpdate,
    RecurrenceDetecteeOut,
    RegleCategorisationCreate,
    RegleCategorisationOut,
    RegleReapplicationResult,
)
from ..services import (
    auth_service,
    budget_categories_service,
    budget_import_service,
    budget_recurrences_service,
    budget_service,
    csv_import,
    upload_limits,
)

router = APIRouter(prefix="/api/budget", tags=["budget"])


# ---------------------------------------------------------------------------
# Catégories
# ---------------------------------------------------------------------------


@router.get("/categories", response_model=list[CategorieBudgetOut])
def list_categories(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return budget_categories_service.list_categories(db, auth_service.id_foyer(current_user))


@router.post("/categories", response_model=CategorieBudgetOut)
def create_categorie(payload: CategorieBudgetCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    try:
        return budget_categories_service.create_categorie(db, auth_service.id_foyer(current_user), payload.nom, payload.parent_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.patch("/categories/{categorie_id}", response_model=CategorieBudgetOut)
def rename_categorie(
    categorie_id: int, payload: CategorieBudgetUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    try:
        return budget_categories_service.rename_categorie(db, auth_service.id_foyer(current_user), categorie_id, payload.nom)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.delete("/categories/{categorie_id}", status_code=204)
def delete_categorie(categorie_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    try:
        budget_categories_service.delete_categorie(db, auth_service.id_foyer(current_user), categorie_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


# ---------------------------------------------------------------------------
# Règles de catégorisation
# ---------------------------------------------------------------------------


@router.get("/regles", response_model=list[RegleCategorisationOut])
def list_regles(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return budget_categories_service.list_regles(db, auth_service.id_foyer(current_user))


@router.post("/regles", response_model=RegleCategorisationOut)
def create_regle(payload: RegleCategorisationCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    try:
        return budget_categories_service.create_regle(db, auth_service.id_foyer(current_user), payload.motif, payload.categorie_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.delete("/regles/{regle_id}", status_code=204)
def delete_regle(regle_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    try:
        budget_categories_service.delete_regle(db, auth_service.id_foyer(current_user), regle_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/regles/reappliquer", response_model=RegleReapplicationResult)
def reappliquer_regles(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    modifies = budget_import_service.reappliquer_regles(db, auth_service.id_foyer(current_user))
    return RegleReapplicationResult(mouvements_modifies=modifies)


# ---------------------------------------------------------------------------
# Import
# ---------------------------------------------------------------------------


@router.post("/import/csv/preview", response_model=ImportPreviewResponse)
async def import_csv_preview(file: UploadFile):
    content = await file.read()
    try:
        upload_limits.verifier_taille_fichier(content)
    except upload_limits.FichierTropVolumineuxError as exc:
        raise HTTPException(status_code=413, detail=str(exc)) from exc
    try:
        parsed = csv_import.parse_upload(file.filename or "upload", content)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return ImportPreviewResponse(
        file_token=parsed.token, columns=parsed.columns, rows=parsed.preview_rows, total_rows=parsed.total_rows
    )


@router.post("/import/csv/confirm", response_model=BudgetImportResult)
def import_csv_confirm(mapping: BudgetColumnMapping, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    try:
        df = csv_import.get_pending(mapping.file_token)
    except KeyError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    colonnes = set(df.columns)
    colonnes_attendues = {mapping.date_col, mapping.libelle_col, mapping.montant_col, mapping.debit_col, mapping.credit_col}
    colonnes_absentes = [c for c in colonnes_attendues if c and c not in colonnes]
    if colonnes_absentes:
        raise HTTPException(status_code=400, detail=f"Colonne(s) introuvable(s) dans le fichier : {', '.join(colonnes_absentes)}")

    mouvements, ignorees = budget_import_service.mouvements_depuis_dataframe(
        df, mapping.date_col, mapping.libelle_col, mapping.montant_col, mapping.debit_col, mapping.credit_col
    )
    resultat = budget_import_service.importer_mouvements(
        db, auth_service.id_foyer(current_user), mouvements, lignes_ignorees=ignorees, compte=mapping.compte
    )
    csv_import.clear_pending(mapping.file_token)
    return BudgetImportResult(**resultat.__dict__)


async def _import_fichier_structure(file: UploadFile, parseur) -> tuple[list, int]:
    content = await file.read()
    try:
        upload_limits.verifier_taille_fichier(content)
    except upload_limits.FichierTropVolumineuxError as exc:
        raise HTTPException(status_code=413, detail=str(exc)) from exc
    mouvements = parseur(content)
    return mouvements, 0


@router.post("/import/ofx", response_model=BudgetImportResult)
async def import_ofx(file: UploadFile, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    mouvements, ignorees = await _import_fichier_structure(file, budget_import_service.parse_ofx)
    resultat = budget_import_service.importer_mouvements(db, auth_service.id_foyer(current_user), mouvements, lignes_ignorees=ignorees)
    return BudgetImportResult(**resultat.__dict__)


@router.post("/import/qif", response_model=BudgetImportResult)
async def import_qif(file: UploadFile, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    mouvements, ignorees = await _import_fichier_structure(file, budget_import_service.parse_qif)
    resultat = budget_import_service.importer_mouvements(db, auth_service.id_foyer(current_user), mouvements, lignes_ignorees=ignorees)
    return BudgetImportResult(**resultat.__dict__)


# ---------------------------------------------------------------------------
# Mouvements
# ---------------------------------------------------------------------------


@router.get("/mouvements", response_model=list[MouvementBancaireOut])
def list_mouvements(
    date_debut: str | None = None,
    date_fin: str | None = None,
    categorie_id: int | None = None,
    compte: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return budget_service.list_mouvements(
        db, auth_service.id_foyer(current_user), date_debut=date_debut, date_fin=date_fin, categorie_id=categorie_id, compte=compte
    )


@router.patch("/mouvements/{mouvement_id}", response_model=MouvementBancaireOut)
def categoriser_mouvement(
    mouvement_id: int,
    payload: MouvementCategorisationUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        return budget_service.categoriser_mouvement(db, auth_service.id_foyer(current_user), mouvement_id, payload.categorie_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


# ---------------------------------------------------------------------------
# Budget cible et résumé
# ---------------------------------------------------------------------------


@router.get("/cibles", response_model=list[BudgetCibleOut])
def list_cibles(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return budget_service.list_cibles(db, auth_service.id_foyer(current_user))


@router.put("/cibles/{categorie_id}", response_model=BudgetCibleOut)
def set_cible(
    categorie_id: int, payload: BudgetCibleUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    try:
        return budget_service.set_cible(db, auth_service.id_foyer(current_user), categorie_id, payload.montant_mensuel)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.delete("/cibles/{categorie_id}", status_code=204)
def delete_cible(categorie_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    budget_service.delete_cible(db, auth_service.id_foyer(current_user), categorie_id)


@router.get("/summary", response_model=BudgetSummary)
def summary(date_debut: str, date_fin: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return budget_service.compute_summary(db, auth_service.id_foyer(current_user), date_debut, date_fin)


# ---------------------------------------------------------------------------
# Récurrences et jonction patrimoine (backlog 2.N.3/2.N.4)
# ---------------------------------------------------------------------------


@router.get("/recurrences", response_model=list[RecurrenceDetecteeOut])
def recurrences(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return budget_recurrences_service.detect_recurrences(db, auth_service.id_foyer(current_user))


@router.get("/jonction-patrimoine", response_model=JonctionPatrimoine)
def jonction_patrimoine(
    date_debut: str, date_fin: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    return budget_service.compute_jonction_patrimoine(db, auth_service.id_foyer(current_user), date_debut, date_fin)
