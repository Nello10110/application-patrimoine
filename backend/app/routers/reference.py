"""Données de référence statiques exposées à l'écran d'aide (FAQ) — aucune donnée
utilisateur, aucun accès base : un simple miroir HTTP de `services/reference_indices`,
pour que la page d'aide reste toujours synchronisée avec les règles réellement
appliquées ailleurs dans l'application (jamais une copie à maintenir à part)."""

from fastapi import APIRouter

from ..schemas import ZoneGeographiqueInfo
from ..services.reference_indices import zones_geographiques

router = APIRouter(prefix="/api/reference", tags=["reference"])


@router.get("/zones-geographiques", response_model=list[ZoneGeographiqueInfo])
def get_zones_geographiques():
    return zones_geographiques()
