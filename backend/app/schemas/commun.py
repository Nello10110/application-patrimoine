from __future__ import annotations

from datetime import datetime  # noqa: F401

from pydantic import BaseModel, ConfigDict, field_validator, model_validator  # noqa: F401


class ImportPreviewResponse(BaseModel):
    file_token: str
    columns: list[str]
    rows: list[dict]
    total_rows: int


class AllocationBreakdownItem(BaseModel):
    categorie: str
    valeur: float
    pourcentage_reel: float


class RepartitionItem(BaseModel):
    categorie: str
    poids: float  # fraction 0-1


class CategoryCompositionItem(BaseModel):
    ticker: str
    nom: str | None = None
    valeur: float


class CategoryCompositionResponse(BaseModel):
    type: str
    categorie: str
    valeur_totale: float
    lignes: list[CategoryCompositionItem]


class RepartitionParClasseItem(BaseModel):
    categorie: str
    valeur: float


class ZoneGeographiqueInfo(BaseModel):
    """Écran d'aide (FAQ) : une zone géographique et les pays qu'elle contient
    (`services/reference_indices.zones_geographiques`)."""

    zone: str
    pays: list[str]
