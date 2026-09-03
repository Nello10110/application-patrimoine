from __future__ import annotations

from datetime import datetime  # noqa: F401

from pydantic import BaseModel, ConfigDict, field_validator, model_validator  # noqa: F401

from ..services.partage_service import DUREE_MAX_JOURS

# ---------------------------------------------------------------------------
# Lien de partage révocable (backlog 2.Q.1)
# ---------------------------------------------------------------------------


class LienPartageCreate(BaseModel):
    nom: str
    detenteur_id: int | None = None
    duree_jours: int = 30
    inclure_patrimoine_net: bool = True
    inclure_repartition: bool = True
    inclure_performance: bool = True
    inclure_budget: bool = False
    inclure_objectifs: bool = False
    masquer_valeurs: bool = False
    code: str | None = None

    @field_validator("nom")
    @classmethod
    def _valider_nom(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Le nom du lien ne peut pas être vide")
        return v

    @field_validator("duree_jours")
    @classmethod
    def _valider_duree(cls, v: int) -> int:
        if v <= 0 or v > DUREE_MAX_JOURS:
            raise ValueError(f"La durée doit être comprise entre 1 et {DUREE_MAX_JOURS} jours")
        return v

    @field_validator("code")
    @classmethod
    def _valider_code(cls, v: str | None) -> str | None:
        if v is not None and len(v.strip()) < 4:
            raise ValueError("Le code doit contenir au moins 4 caractères")
        return v.strip() if v else None


class LienPartageOut(BaseModel):
    """Contrairement à `AuthToken` (jeton de session, jamais réaffiché après sa
    création — cf. `SessionOut`), `token` reste exposé à chaque relecture : un lien
    de partage est fait pour être recopié/renvoyé plus tard par le propriétaire, pas
    consulté une seule fois à sa création. Différence assumée, pas un oubli."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    token: str
    nom: str
    detenteur_id: int | None
    inclure_patrimoine_net: bool
    inclure_repartition: bool
    inclure_performance: bool
    inclure_budget: bool
    inclure_objectifs: bool
    masquer_valeurs: bool
    code_requis: bool
    created_at: datetime
    expires_at: datetime
    revoked_at: datetime | None


class PartageAccesRequest(BaseModel):
    code: str | None = None


class PartageRepartitionItem(BaseModel):
    categorie: str
    valeur: float | None
    pourcentage: float


class PartagePatrimoineNet(BaseModel):
    patrimoine_net: float | None
    actifs_totaux: float | None
    passifs_totaux: float | None
    repartition_par_classe: list[PartageRepartitionItem]


class PartageExposition(BaseModel):
    valeur_totale: float | None
    repartition_geo: list[PartageRepartitionItem]
    repartition_classe: list[PartageRepartitionItem]
    plus_grosse_ligne_pct: float | None
    top5_lignes_pct: float | None
    premiere_zone_geo: str | None
    premiere_zone_geo_pct: float | None


class PartagePerformance(BaseModel):
    valeur_totale: float | None
    cout_total_investi: float | None
    gain_perte_total: float | None
    rendement_simple_pct: float | None
    rendement_annualise_pct: float | None
    dividendes_percus: float | None
    frais_payes: float | None


class PartageBudget(BaseModel):
    periode_debut: str
    periode_fin: str
    entrees: float | None
    sorties: float | None
    disponible: float | None
    repartition_sorties: list[PartageRepartitionItem]


class PartageObjectif(BaseModel):
    nom: str
    type: str
    echeance: str
    progression_pct: float | None
    diagnostic: str
    retard_mois: int | None


class PartagePayload(BaseModel):
    """Réponse de `POST /api/partage/public/{token}` — jamais les schémas internes
    tels quels (cf. `services/partage_service.compute_payload`)."""

    nom_lien: str
    masque: bool
    detenteur_id: int | None
    patrimoine_net: PartagePatrimoineNet | None
    exposition: PartageExposition | None
    performance: PartagePerformance | None
    budget: PartageBudget | None
    objectifs: list[PartageObjectif] | None
