"""Import du grand livre de transactions (format Trade Republic) et reconstruction
du portefeuille qui en découle.

Import en deux temps depuis le redesign du 03/09/2026 (demande directe de
l'utilisateur : « il faut qu'à l'import il me demande et remplisse
l'établissement ») — même patron que l'import de relevé de positions
(`routers/portfolio.py::import_preview`/`import_confirm`) : `/import/apercu`
parse le fichier et compte les lignes par bucket de compte suggéré
(`transaction_import.cle_compte`), `/import` crée les comptes nécessaires sous
l'établissement choisi puis importe."""

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..database import get_db
from ..models import Compte, Etablissement, Transaction, User
from ..schemas import (
    LedgerImportApercu,
    LedgerImportConfirm,
    LedgerImportResult,
    TransactionImportApercu,
    TransactionImportConfirm,
    TransactionImportResult,
)
from ..services import auth_service, comptes_service, ledger_import, portfolio_reconstruction, transaction_import, upload_limits

router = APIRouter(prefix="/api/transactions", tags=["transactions"])

# Tous les champs mutables de `Transaction` (hors `id`/`user_id`/`transaction_id`/
# `created_at`) — comparés lors d'un ré-import pour décider si une ligne déjà connue
# doit être RE-SYNCHRONISÉE (retour utilisateur du 10/09/2026 : « ça ne s'additionne
# pas mais ça met à jour les données ») plutôt qu'ignorée en silence comme avant.
# Même liste de clés que `transaction_import.parse_transactions_file` produit par ligne.
_CHAMPS_TRANSACTION = (
    "datetime_utc",
    "date",
    "category",
    "type",
    "asset_class",
    "symbol",
    "name",
    "shares",
    "price",
    "amount",
    "fee",
    "tax",
    "description",
)


def _normalise_pour_comparaison(valeur):
    """Neutralise l'écart de fuseau entre `datetime_utc` fraîchement analysé
    (conscient du fuseau, `datetime.fromisoformat` avec un offset explicite) et sa
    valeur relue depuis la base (naïve — SQLite ne conserve pas l'information de
    fuseau) : sans cette normalisation, ce champ semblerait TOUJOURS différent d'un
    ré-import à l'autre, même strictement identique, et chaque ré-import
    signalerait à tort une mise à jour au lieu d'un doublon ignoré. Sans effet sur
    les autres champs, déjà de simples types directement comparables."""
    if isinstance(valeur, datetime) and valeur.tzinfo is not None:
        return valeur.astimezone(UTC).replace(tzinfo=None)
    return valeur


def _upsert_transactions(db: Session, user_id: int, rows: list[dict]) -> tuple[int, int, int]:
    """Ré-synchronisation par `transaction_id` — factorisé pour l'import Trade
    Republic ET l'import Ledger (retour utilisateur du 10/09/2026 : « que ça ne
    s'additionne pas mais mette à jour », généralisable aux deux formats plutôt que
    dupliqué). Renvoie `(importees, mises_a_jour, doublons_ignores)`. Scopé à
    `user_id` : un `transaction_id` n'est garanti unique que par utilisateur
    (`UniqueConstraint`), jamais globalement."""
    existantes_par_id = {t.transaction_id: t for t in db.query(Transaction).filter(Transaction.user_id == user_id).all()}

    doublons = 0
    importees = 0
    mises_a_jour = 0
    for row in rows:
        existante = existantes_par_id.get(row["transaction_id"])
        if existante is None:
            nouvelle = Transaction(**row, user_id=user_id)
            db.add(nouvelle)
            existantes_par_id[row["transaction_id"]] = nouvelle
            importees += 1
            continue

        champs_modifies = [
            champ for champ in _CHAMPS_TRANSACTION
            if _normalise_pour_comparaison(getattr(existante, champ)) != _normalise_pour_comparaison(row[champ])
        ]
        if not champs_modifies:
            doublons += 1
            continue
        for champ in champs_modifies:
            setattr(existante, champ, row[champ])
        mises_a_jour += 1

    return importees, mises_a_jour, doublons


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
        etablissement_id = comptes_service.get_or_create_etablissement(
            db, user_id, payload.etablissement_nom, payload.etablissement_logo_key
        ).id

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

    # Re-synchronisation scopée à l'utilisateur (Milestone 2a) : le transaction_id
    # est émis par le courtier, pas garanti unique entre deux comptes courtier
    # différents — sans ce filtre, l'import de l'un pourrait toucher à tort une
    # transaction parce qu'un AUTRE utilisateur a, par coïncidence, le même
    # identifiant. Lignes complètes (pas seulement l'id) : l'export Trade Republic
    # est TOUJOURS l'historique complet, un ré-import doit donc RE-SYNCHRONISER une
    # ligne déjà connue si le courtier en a corrigé un champ dans l'intervalle
    # (montant, frais...), pas seulement la retrouver pour l'ignorer (retour
    # utilisateur du 10/09/2026 : « que ça ne s'additionne pas mais mette à jour »).
    importees, mises_a_jour, doublons = _upsert_transactions(db, user_id, parsed.rows)

    db.commit()
    transaction_import.clear_pending_transactions(payload.file_token)

    resultat_reconstruction = portfolio_reconstruction.rebuild_holdings(db, user_id, comptes_a_assigner=comptes_a_assigner)

    return TransactionImportResult(
        lignes_lues=parsed.lignes_lues,
        importees=importees,
        mises_a_jour=mises_a_jour,
        doublons_ignores=doublons,
        mouvements_hors_bourse_exclus=parsed.mouvements_hors_bourse_exclus,
        positions_recalculees=resultat_reconstruction.positions_recalculees,
        anomalies_detectees=resultat_reconstruction.anomalies_detectees,
        lignes_manuelles_remplacees=resultat_reconstruction.lignes_manuelles_remplacees,
        comptes_crees=comptes_crees,
    )


@router.post("/import-ledger/apercu", response_model=LedgerImportApercu)
async def import_ledger_apercu(file: UploadFile, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Retour utilisateur du 11/09/2026 : import d'un export de wallet matériel
    Ledger (crypto), format distinct de Trade Republic — même patron en deux temps
    (aperçu puis confirmation) que `import_apercu` ci-dessus, mais un décompte par
    devise plutôt que par bucket de compte : un wallet accumule souvent des jetons
    spam/poussière que l'utilisateur choisit de ne pas importer à l'étape suivante."""
    content = await file.read()
    try:
        upload_limits.verifier_taille_fichier(content)
    except upload_limits.FichierTropVolumineuxError as exc:
        raise HTTPException(status_code=413, detail=str(exc)) from exc
    try:
        parsed = ledger_import.parse_ledger_file(content)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    token = ledger_import.stage_parsed_ledger(parsed)
    etablissements = comptes_service.list_etablissements(db, auth_service.id_foyer(current_user))

    return LedgerImportApercu(
        file_token=token,
        lignes_lues=parsed.lignes_lues,
        lignes_ignorees_statut=parsed.lignes_ignorees_statut,
        lignes_ignorees_type_operation=parsed.lignes_ignorees_type_operation,
        devises=[
            {"ticker": d.ticker, "nb_operations": d.nb_operations, "montant_total_eur": d.montant_total_eur}
            for d in sorted(parsed.devises.values(), key=lambda d: d.montant_total_eur, reverse=True)
        ],
        etablissements=etablissements,
    )


@router.post("/import-ledger", response_model=LedgerImportResult)
def import_ledger(payload: LedgerImportConfirm, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    user_id = auth_service.id_foyer(current_user)
    try:
        parsed = ledger_import.get_pending_ledger(payload.file_token)
    except KeyError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if not payload.devises_selectionnees:
        raise HTTPException(status_code=400, detail="Choisissez au moins une devise à importer")

    if payload.etablissement_id is not None:
        etablissement = db.get(Etablissement, payload.etablissement_id)
        if etablissement is None or etablissement.user_id != user_id:
            raise HTTPException(status_code=404, detail="Établissement introuvable")
        etablissement_id = payload.etablissement_id
    else:
        etablissement_id = comptes_service.get_or_create_etablissement(
            db, user_id, payload.etablissement_nom, payload.etablissement_logo_key
        ).id

    devises_choisies = set(payload.devises_selectionnees)
    existait_deja = db.query(Compte).filter(Compte.user_id == user_id, Compte.nom == payload.nom_compte).first() is not None
    compte = comptes_service.get_or_create_compte_sans_commit(db, user_id, payload.nom_compte, etablissement_id)
    comptes_crees = 0 if existait_deja else 1
    comptes_a_assigner = dict.fromkeys(devises_choisies, compte.id)

    rows_filtrees = [row for row in parsed.rows if row["symbol"] in devises_choisies]
    importees, mises_a_jour, doublons = _upsert_transactions(db, user_id, rows_filtrees)

    db.commit()
    ledger_import.clear_pending_ledger(payload.file_token)

    resultat_reconstruction = portfolio_reconstruction.rebuild_holdings(db, user_id, comptes_a_assigner=comptes_a_assigner)

    lignes_ignorees = parsed.lignes_ignorees_statut + sum(parsed.lignes_ignorees_type_operation.values())

    return LedgerImportResult(
        lignes_lues=parsed.lignes_lues,
        importees=importees,
        mises_a_jour=mises_a_jour,
        doublons_ignores=doublons,
        lignes_ignorees=lignes_ignorees,
        positions_recalculees=resultat_reconstruction.positions_recalculees,
        anomalies_detectees=resultat_reconstruction.anomalies_detectees,
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
