"""Comparaison objectifs vs réel : répartition géo/secteur, indicateurs de risque,
recommandations de rééquilibrage, détail de composition d'une catégorie."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..database import get_db
from ..models import AllocationTarget, User
from ..schemas import (
    AllocationBreakdownItem,
    AnalysisResponse,
    CategoryCompositionResponse,
    CoutGestionConsolide,
    QualiteDonnees,
    RebalancingAction,
    RepartitionComptesResponse,
    RiskIndicators,
)
from ..services import analysis_service, auth_service, preferences_service, rebalancing

router = APIRouter(prefix="/api/analysis", tags=["analysis"])


@router.get("/composition", response_model=CategoryCompositionResponse)
def get_category_composition(type: str, categorie: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if type not in ("geo", "sector"):
        raise HTTPException(status_code=400, detail="type doit être 'geo' ou 'sector'")

    # Immobilier/SCPI/assurance-vie/PER (Phase 1 de `docs/ROADMAP.md`) exclus : cette
    # page reste le look-through géo/sectoriel du seul portefeuille financier — voir
    # `analysis_service.holdings_financiers` et le patrimoine net (`/api/patrimoine/net`).
    holdings = analysis_service.holdings_financiers(db, auth_service.id_foyer(current_user))
    valued = analysis_service.value_holdings(holdings)
    lignes = analysis_service.holdings_in_category(db, valued, type, categorie)
    valeur_totale = sum(l["valeur"] for l in lignes)

    return CategoryCompositionResponse(type=type, categorie=categorie, valeur_totale=round(valeur_totale, 2), lignes=lignes)


@router.get("/comptes", response_model=RepartitionComptesResponse)
def get_repartition_comptes(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Répartition de la valeur actuelle par compte (LOT 5.1) : cf. docstring de
    `analysis_service.repartition_par_compte` — aucune rentabilité par compte
    n'est ni calculée ni calculable, seule la valeur l'est. Déclarée AVANT
    `/{annee}` : sans cet ordre, FastAPI tenterait de convertir "comptes" en `int`
    pour la route paramétrée et renverrait une erreur de validation."""
    # Immobilier/SCPI/assurance-vie/PER (Phase 1 de `docs/ROADMAP.md`) exclus : cette
    # page reste le look-through géo/sectoriel du seul portefeuille financier — voir
    # `analysis_service.holdings_financiers` et le patrimoine net (`/api/patrimoine/net`).
    holdings = analysis_service.holdings_financiers(db, auth_service.id_foyer(current_user))
    valued = analysis_service.value_holdings(holdings)
    valeur_totale = sum(v.valeur for v in valued)
    items = analysis_service.repartition_par_compte(valued)
    a_des_comptes_annotes = any(v.holding.compte for v in valued)

    return RepartitionComptesResponse(valeur_totale=round(valeur_totale, 2), items=items, a_des_comptes_annotes=a_des_comptes_annotes)


@router.get("/cout-gestion", response_model=CoutGestionConsolide)
def get_cout_gestion_consolide(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Coût de gestion annuel consolidé des fonds/ETF détenus (roadmap Phase 3, § E.3) :
    cf. docstring de `analysis_service.compute_cout_gestion_consolide`. Déclarée AVANT
    `/{annee}` pour la même raison que `/comptes` ci-dessus."""
    holdings = analysis_service.holdings_financiers(db, auth_service.id_foyer(current_user))
    valued = analysis_service.value_holdings(holdings)
    return CoutGestionConsolide(**analysis_service.compute_cout_gestion_consolide(valued))


@router.get("/{annee}", response_model=AnalysisResponse)
def get_analysis(annee: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    # Immobilier/SCPI/assurance-vie/PER (Phase 1 de `docs/ROADMAP.md`) exclus : cette
    # page reste le look-through géo/sectoriel du seul portefeuille financier — voir
    # `analysis_service.holdings_financiers` et le patrimoine net (`/api/patrimoine/net`).
    holdings = analysis_service.holdings_financiers(db, auth_service.id_foyer(current_user))
    valued = analysis_service.value_holdings(holdings)
    valeur_totale = sum(v.valeur for v in valued)

    targets = db.query(AllocationTarget).filter(AllocationTarget.user_id == auth_service.id_foyer(current_user), AllocationTarget.annee == annee).all()
    geo_cibles = {t.categorie: t.pourcentage_cible for t in targets if t.type == "geo"}
    sector_cibles = {t.categorie: t.pourcentage_cible for t in targets if t.type == "sector"}

    geo_reel = analysis_service.breakdown_with_lookthrough(db, valued, "geo")
    sector_reel = analysis_service.breakdown_with_lookthrough(db, valued, "sector")
    risques = analysis_service.compute_risk_indicators(valued, geo_reel, sector_reel)
    qualite = analysis_service.compute_data_quality(db, valued)

    geo_items = _build_breakdown(geo_reel, geo_cibles, valeur_totale)
    sector_items = _build_breakdown(sector_reel, sector_cibles, valeur_totale)

    actions = []
    if valeur_totale > 0:
        actions += rebalancing.compute_actions("geo", geo_reel, geo_cibles, valeur_totale)
        actions += rebalancing.compute_actions("sector", sector_reel, sector_cibles, valeur_totale)
    actions.sort(key=lambda a: abs(a["ecart_pourcentage"]), reverse=True)

    # Alertes (LOT 5.5) : sous-ensemble des recommandations déjà calculées ci-dessus,
    # dont l'écart absolu dépasse le seuil réglable (défaut 5 points) — jamais
    # recalculé depuis `geo_reel`/`sector_reel`. Seuil distinct de
    # `rebalancing.SEUIL_ECART_PCT` (2 points, fixe) qui décide, lui, si une
    # recommandation existe tout court : une recommandation informe, une alerte
    # réclame une action de l'utilisateur.
    seuil_alerte = preferences_service.lire_seuil_alerte_ecart_pct(db, auth_service.id_foyer(current_user))
    alertes = [a for a in actions if abs(a["ecart_pourcentage"]) > seuil_alerte]

    return AnalysisResponse(
        annee=annee,
        valeur_totale=valeur_totale,
        geo=geo_items,
        sector=sector_items,
        risques=RiskIndicators(**risques),
        recommandations=[RebalancingAction(**a) for a in actions],
        alertes=[RebalancingAction(**a) for a in alertes],
        qualite_donnees=QualiteDonnees(**qualite),
    )


def _build_breakdown(reel: dict[str, float], cibles: dict[str, float], valeur_totale: float) -> list[AllocationBreakdownItem]:
    categories = set(reel) | set(cibles)
    items = []
    for categorie in categories:
        valeur = reel.get(categorie, 0.0)
        pct_reel = (valeur / valeur_totale * 100) if valeur_totale > 0 else 0.0
        pct_cible = cibles.get(categorie)
        ecart = (pct_reel - pct_cible) if pct_cible is not None else None
        items.append(
            AllocationBreakdownItem(
                categorie=categorie,
                valeur=round(valeur, 2),
                pourcentage_reel=round(pct_reel, 1),
                pourcentage_cible=pct_cible,
                ecart=round(ecart, 1) if ecart is not None else None,
            )
        )
    items.sort(key=lambda i: i.valeur, reverse=True)
    return items
