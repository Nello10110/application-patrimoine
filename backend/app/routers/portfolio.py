"""Portefeuille : import de relevé (mapping manuel de colonnes), CRUD des positions,
fiche détaillée et historique de prix d'une ligne."""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from sqlalchemy.orm import Session

from ..auth import get_current_user, require_role
from ..database import get_db
from ..models import ORIGINE_MANUEL, ROLE_INVITE, ROLE_MEMBRE, ROLE_PROPRIETAIRE, Holding, QuotiteHolding, User
from ..schemas import (
    ColumnMapping,
    HoldingCreate,
    HoldingDetail,
    HoldingImmobilierOut,
    HoldingImmobilierUpdate,
    HoldingOut,
    HoldingPriceHistoryResponse,
    HoldingUpdate,
    ImportPreviewResponse,
    ImportResult,
    QuotitesUpdate,
    ValuationHistoryPoint,
)
from ..services import (
    analysis_service,
    auth_service,
    csv_import,
    detenteurs_service,
    historical_performance_service,
    holding_detail_service,
    immobilier_service,
    performance_service,
    upload_limits,
)

_peut_ecrire = require_role(ROLE_PROPRIETAIRE, ROLE_MEMBRE)

router = APIRouter(prefix="/api/portfolio", tags=["portfolio"])


@router.post("/import/preview", response_model=ImportPreviewResponse)
async def import_preview(file: UploadFile):
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


def _colonnes_mappees_absentes(mapping: ColumnMapping, colonnes_fichier: list[str]) -> list[str]:
    """Colonnes du mapping (obligatoires et optionnelles) qui n'existent pas dans le
    fichier réellement uploadé (LOT 7.4) : sans ce contrôle, une erreur de mapping se
    traduit par un import silencieusement vide (`row.get(...)` renvoie toujours `None`)
    plutôt que par un message clair."""
    candidates = {
        "ticker": mapping.ticker_col,
        "quantité": mapping.quantite_col,
        "prix de revient": mapping.prix_revient_col,
        "nom": mapping.nom_col,
        "compte": mapping.compte_col,
        "devise": mapping.devise_col,
    }
    return [f"{libelle} ('{colonne}')" for libelle, colonne in candidates.items() if colonne and colonne not in colonnes_fichier]


@router.post("/import/confirm", response_model=ImportResult)
def import_confirm(mapping: ColumnMapping, db: Session = Depends(get_db), current_user: User = Depends(_peut_ecrire)):
    try:
        df = csv_import.get_pending(mapping.file_token)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    colonnes_absentes = _colonnes_mappees_absentes(mapping, list(df.columns))
    if colonnes_absentes:
        raise HTTPException(
            status_code=400,
            detail=f"Colonne(s) introuvable(s) dans le fichier : {', '.join(colonnes_absentes)}",
        )

    imported = 0
    skipped = 0
    errors: list[str] = []

    # Tout ou rien (LOT 3.3) : un import (potentiellement précédé d'un vidage du
    # portefeuille via `replace_existing`) est une seule transaction. Une erreur en
    # cours de boucle (donnée inattendue, bug) déclenche un rollback explicite plutôt
    # que de laisser le portefeuille dans un état partiel — au pire déjà vidé, jamais
    # réécrit.
    try:
        if mapping.replace_existing:
            # Ne vide que les lignes que l'utilisateur gère lui-même (saisie ou relevé
            # importé). Les lignes issues du grand livre de transactions appartiennent
            # au grand livre : les supprimer ici créerait un état incohérent que le
            # prochain import de transactions rétablirait tout seul, sans que
            # l'utilisateur comprenne pourquoi (cf. `models.Holding.origine`).
            db.query(Holding).filter(Holding.user_id == auth_service.id_foyer(current_user), Holding.origine == ORIGINE_MANUEL).delete()

        for idx, row in df.iterrows():
            ticker = (_cellule_texte(row, mapping.ticker_col) or "").upper()
            qty_val = csv_import.to_float(row.get(mapping.quantite_col))

            if not ticker or qty_val is None:
                skipped += 1
                errors.append(f"Ligne {idx + 2}: ticker ou quantité invalide")
                continue

            db.add(
                Holding(
                    user_id=auth_service.id_foyer(current_user),
                    ticker=ticker,
                    nom=_cellule_texte(row, mapping.nom_col),
                    quantite=qty_val,
                    prix_revient_moyen=csv_import.to_float(row.get(mapping.prix_revient_col)) if mapping.prix_revient_col else None,
                    compte=_cellule_texte(row, mapping.compte_col),
                    devise=_cellule_texte(row, mapping.devise_col),
                    origine=ORIGINE_MANUEL,
                )
            )
            imported += 1

        db.commit()
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=400,
            detail=f"Échec de l'import, le portefeuille n'a pas été modifié : {exc}",
        ) from exc

    csv_import.clear_pending(mapping.file_token)

    return ImportResult(imported=imported, skipped=skipped, errors=errors)


def _holdings_visibles(db: Session, current_user: User):
    """Toutes les lignes du foyer pour propriétaire/membre ; pour un invité (2.L.2),
    seulement celles où l'un de ses détenteurs assignés a une quotité — jamais un
    filtrage côté client uniquement, contournable dans l'onglet réseau."""
    requete = db.query(Holding).filter(Holding.user_id == auth_service.id_foyer(current_user))
    if current_user.role == ROLE_INVITE:
        perimetre = detenteurs_service.perimetre_invite(db, current_user.id)
        if not perimetre:
            return []
        requete = requete.join(QuotiteHolding, QuotiteHolding.holding_id == Holding.id).filter(
            QuotiteHolding.detenteur_id.in_(perimetre), QuotiteHolding.quotite_pct > 0
        )
    return requete.order_by(Holding.ticker).all()


@router.get("/holdings", response_model=list[HoldingOut])
def list_holdings(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    holdings = _holdings_visibles(db, current_user)
    rendements = performance_service.compute_holding_returns(db, auth_service.id_foyer(current_user))
    # `value_holdings` applique déjà la règle « prix de marché, à défaut prix de
    # revient » ; on la réutilise ici pour ne pas dupliquer ce calcul (LOT 6.7).
    # Elle retombe sur 0 quand aucun prix n'est connu (pratique pour les sommes des
    # écrans d'analyse) : on distingue ce cas ici pour renvoyer `None` plutôt que 0,
    # comme convenu pour l'affichage d'une ligne isolée.
    valued = analysis_service.value_holdings(holdings)
    result = []
    for h, v in zip(holdings, valued):
        out = HoldingOut.model_validate(h)
        r = rendements.get(h.ticker, {})
        out.rendement_depuis_achat_pct = r.get("rendement_depuis_achat_pct")
        out.rendement_annualise_pct = r.get("rendement_annualise_pct")
        # Bug corrigé en marge de 2.M.1 : une ligne valorisée manuellement
        # (`valeur_estimee`, cf. `models.TYPES_ACTIF_PATRIMOINE_MANUEL`) sans
        # `prix_revient_moyen` renseigné (cas normal d'un compte courant ou d'une
        # épargne réglementée, qui n'a pas de "prix de revient") retombait ici sur
        # `None` malgré une valeur réellement connue — `value_holdings` la calculait
        # pourtant correctement, seul cet affichage l'ignorait.
        prix_connu = (
            (h.market_data is not None and h.market_data.prix_actuel is not None)
            or h.prix_revient_moyen is not None
            or h.valeur_estimee is not None
        )
        out.valeur = v.valeur if prix_connu else None
        result.append(out)
    return result


def _verifier_ticker_visible_invite(db: Session, current_user: User, ticker: str) -> None:
    if current_user.role != ROLE_INVITE:
        return
    tickers_visibles = {h.ticker for h in _holdings_visibles(db, current_user)}
    if ticker not in tickers_visibles:
        raise HTTPException(status_code=404, detail="Ligne introuvable")


@router.get("/holdings/{ticker}/detail", response_model=HoldingDetail)
def get_holding_detail(ticker: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    _verifier_ticker_visible_invite(db, current_user, ticker)
    detail = holding_detail_service.build_holding_detail(db, ticker, auth_service.id_foyer(current_user))
    if detail is None:
        raise HTTPException(status_code=404, detail="Ligne introuvable")
    return HoldingDetail(**detail)


@router.put("/holdings/{ticker}/immobilier", response_model=HoldingImmobilierOut)
def update_holding_immobilier(
    ticker: str,
    payload: HoldingImmobilierUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(_peut_ecrire),
):
    """Crée ou remplace le détail immobilier de cette ligne (backlog 2.M.3) — pas
    restreint à `type_actif == "REAL_ESTATE"` côté serveur (l'UI ne le propose que
    pour ce type, mais rien n'empêche techniquement un autre usage)."""
    holding = db.query(Holding).filter(Holding.ticker == ticker, Holding.user_id == auth_service.id_foyer(current_user)).first()
    if holding is None:
        raise HTTPException(status_code=404, detail="Ligne introuvable")
    immobilier_service.upsert_detail_immobilier(db, holding.id, **payload.model_dump())
    detail = holding_detail_service.build_holding_detail(db, ticker, auth_service.id_foyer(current_user))
    return HoldingImmobilierOut(**detail["immobilier"])


@router.get("/holdings/{ticker}/immobilier-history", response_model=list[ValuationHistoryPoint])
def get_holding_valuation_history(ticker: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Historique daté des valorisations manuelles (backlog 2.M.3) — jamais écrasé,
    contrairement à `Holding.valeur_estimee`/`date_valeur_estimee` (valeur courante
    seule). Pas réservé à l'immobilier : disponible pour tout type valorisé
    manuellement, cf. `models.HoldingValuationHistory`."""
    _verifier_ticker_visible_invite(db, current_user, ticker)
    holding = db.query(Holding).filter(Holding.ticker == ticker, Holding.user_id == auth_service.id_foyer(current_user)).first()
    if holding is None:
        raise HTTPException(status_code=404, detail="Ligne introuvable")
    points = immobilier_service.historique_valorisation(db, holding.id)
    return [ValuationHistoryPoint(date_valeur=p.date_valeur, valeur=p.valeur) for p in points]


@router.put("/holdings/{ticker}/quotites")
def set_holding_quotites(
    ticker: str,
    payload: QuotitesUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(_peut_ecrire),
):
    """Remplace intégralement la répartition (quotités) de cette ligne entre
    détenteurs (backlog 2.L.1). Une liste vide retire toute répartition (retombe à
    100 % foyer implicite)."""
    holding = db.query(Holding).filter(Holding.ticker == ticker, Holding.user_id == auth_service.id_foyer(current_user)).first()
    if holding is None:
        raise HTTPException(status_code=404, detail="Ligne introuvable")
    try:
        detenteurs_service.set_quotites_holding(
            db, auth_service.id_foyer(current_user), holding, [(q.detenteur_id, q.quotite_pct) for q in payload.quotites]
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"ok": True}


@router.get("/holdings/{ticker}/price-history", response_model=HoldingPriceHistoryResponse)
def get_holding_price_history(ticker: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    _verifier_ticker_visible_invite(db, current_user, ticker)
    result = historical_performance_service.compute_holding_price_history(db, ticker, auth_service.id_foyer(current_user))
    return HoldingPriceHistoryResponse(**result) if result else HoldingPriceHistoryResponse(points=[])


@router.post("/holdings", response_model=HoldingOut)
def create_holding(payload: HoldingCreate, db: Session = Depends(get_db), current_user: User = Depends(_peut_ecrire)):
    # Ticker déjà nettoyé/normalisé en majuscules par `HoldingBase._valider_ticker`
    # (cf. schemas.py) : plus besoin de le refaire ici.
    donnees = payload.model_dump()
    # `date_valeur_estimee` (immobilier/SCPI/assurance-vie/PER, Phase 1 de
    # `docs/ROADMAP.md`) n'est jamais saisie par le client (cf. `HoldingBase`) : posée
    # ici dès qu'une valeur estimée est fournie à la création.
    if donnees.get("valeur_estimee") is not None:
        donnees["date_valeur_estimee"] = datetime.now(timezone.utc).replace(tzinfo=None)
    holding = Holding(**donnees, origine=ORIGINE_MANUEL, user_id=auth_service.id_foyer(current_user))
    db.add(holding)
    db.commit()
    db.refresh(holding)
    if holding.valeur_estimee is not None:
        immobilier_service.enregistrer_point_historique(db, holding.id, holding.valeur_estimee, holding.date_valeur_estimee)
    return holding


@router.patch("/holdings/{holding_id}", response_model=HoldingOut)
def update_holding(holding_id: int, payload: HoldingUpdate, db: Session = Depends(get_db), current_user: User = Depends(_peut_ecrire)):
    holding = db.get(Holding, holding_id)
    if holding is None or holding.user_id != auth_service.id_foyer(current_user):
        raise HTTPException(status_code=404, detail="Ligne introuvable")
    updates = payload.model_dump(exclude_unset=True)
    # `date_valeur_estimee` n'avance que si `valeur_estimee` change réellement dans cet
    # appel — pas à chaque modification de la ligne (compte, nom...), pour rester une
    # vraie date de « dernière mise à jour de l'estimation ».
    if "valeur_estimee" in updates:
        updates["date_valeur_estimee"] = datetime.now(timezone.utc).replace(tzinfo=None)
    for key, value in updates.items():
        setattr(holding, key, value)
    db.commit()
    db.refresh(holding)
    # Historique daté (backlog 2.M.3) : un nouveau point à chaque changement RÉEL de
    # `valeur_estimee` — pas quand elle est explicitement effacée (`None`, rien à
    # enregistrer), ni quand un autre champ change seul (déjà exclu par le `if`
    # ci-dessus, qui ne pose `date_valeur_estimee` que dans ce même cas).
    if "valeur_estimee" in updates and holding.valeur_estimee is not None:
        immobilier_service.enregistrer_point_historique(db, holding.id, holding.valeur_estimee, holding.date_valeur_estimee)
    return holding


@router.delete("/holdings/{holding_id}")
def delete_holding(holding_id: int, db: Session = Depends(get_db), current_user: User = Depends(_peut_ecrire)):
    holding = db.get(Holding, holding_id)
    if holding is None or holding.user_id != auth_service.id_foyer(current_user):
        raise HTTPException(status_code=404, detail="Ligne introuvable")
    db.delete(holding)
    db.commit()
    return {"ok": True}
