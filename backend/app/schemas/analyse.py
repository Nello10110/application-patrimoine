from __future__ import annotations

from datetime import datetime  # noqa: F401

from pydantic import BaseModel, ConfigDict, field_validator, model_validator  # noqa: F401

from .commun import AllocationBreakdownItem


class RiskIndicators(BaseModel):
    valeur_totale: float
    nombre_lignes: int
    top_ligne_poids: float
    top_ligne_nom: str | None = None
    top_pays_poids: float
    top_pays_nom: str | None = None
    top_secteur_poids: float
    top_secteur_nom: str | None = None
    score_diversification: float
    lignes_sans_donnees: int


class QualiteDonnees(BaseModel):
    """Origine de la répartition géographique affichée (cf. LOT 2.1/2.3) : permet de
    signaler à l'écran quand le "réel" du tableau de bord est mesuré plutôt qu'estimé,
    voire pas du tout disponible."""

    valeur_composition_reelle: float
    pct_composition_reelle: float
    valeur_estimee_par_indice: float
    pct_estimee_par_indice: float
    valeur_non_categorisee: float
    pct_non_categorisee: float
    valeur_sans_cotation: float
    pct_sans_cotation: float


class AnalysisResponse(BaseModel):
    valeur_totale: float
    geo: list[AllocationBreakdownItem]
    sector: list[AllocationBreakdownItem]
    risques: RiskIndicators
    qualite_donnees: QualiteDonnees




class CoutGestionConsolide(BaseModel):
    """Réponse de `GET /api/analysis/cout-gestion` (roadmap Phase 3, § E.3)."""

    valeur_fonds: float
    valeur_fonds_avec_ter_connu: float
    couverture_pct: float
    cout_annuel_estime: float
