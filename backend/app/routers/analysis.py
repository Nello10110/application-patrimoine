"""Répartition géo/secteur du portefeuille financier, indicateurs de risque,
qualité des données, détail de composition d'une catégorie."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..database import get_db
from ..models import User
from ..schemas import (
    AllocationBreakdownItem,
    AnalysisResponse,
    CategoryCompositionResponse,
    CoutGestionConsolide,
    QualiteDonnees,
    RepartitionComptesResponse,
    RiskIndicators,
)
from ..services import analysis_service, auth_service

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
    valeur_totale = sum(ligne["valeur"] for ligne in lignes)

    return CategoryCompositionResponse(type=type, categorie=categorie, valeur_totale=round(valeur_totale, 2), lignes=lignes)


@router.get("/comptes", response_model=RepartitionComptesResponse)
def get_repartition_comptes(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Répartition de la valeur actuelle par compte (LOT 5.1) : cf. docstring de
    `analysis_service.repartition_par_compte` — aucune rentabilité par compte
    n'est ni calculée ni calculable, seule la valeur l'est."""
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
    cf. docstring de `analysis_service.compute_cout_gestion_consolide`."""
    holdings = analysis_service.holdings_financiers(db, auth_service.id_foyer(current_user))
    valued = analysis_service.value_holdings(holdings)
    return CoutGestionConsolide(**analysis_service.compute_cout_gestion_consolide(valued))


@router.get("", response_model=AnalysisResponse)
def get_analysis(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    # Immobilier/SCPI/assurance-vie/PER (Phase 1 de `docs/ROADMAP.md`) exclus : cette
    # page reste le look-through géo/sectoriel du seul portefeuille financier — voir
    # `analysis_service.holdings_financiers` et le patrimoine net (`/api/patrimoine/net`).
    holdings = analysis_service.holdings_financiers(db, auth_service.id_foyer(current_user))
    valued = analysis_service.value_holdings(holdings)
    valeur_totale = sum(v.valeur for v in valued)

    geo_reel = analysis_service.breakdown_with_lookthrough(db, valued, "geo")
    sector_reel = analysis_service.breakdown_with_lookthrough(db, valued, "sector")
    risques = analysis_service.compute_risk_indicators(valued, geo_reel, sector_reel)
    qualite = analysis_service.compute_data_quality(db, valued)

    geo_items = _build_breakdown(geo_reel, valeur_totale)
    sector_items = _build_breakdown(sector_reel, valeur_totale)

    return AnalysisResponse(
        valeur_totale=valeur_totale,
        geo=geo_items,
        sector=sector_items,
        risques=RiskIndicators(**risques),
        qualite_donnees=QualiteDonnees(**qualite),
    )


def _build_breakdown(reel: dict[str, float], valeur_totale: float) -> list[AllocationBreakdownItem]:
    items = []
    for categorie, valeur in reel.items():
        pct_reel = (valeur / valeur_totale * 100) if valeur_totale > 0 else 0.0
        items.append(
            AllocationBreakdownItem(
                categorie=categorie,
                valeur=round(valeur, 2),
                pourcentage_reel=round(pct_reel, 1),
            )
        )
    items.sort(key=lambda i: i.valeur, reverse=True)
    return items
