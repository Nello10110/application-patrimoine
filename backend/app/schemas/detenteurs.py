from __future__ import annotations

from datetime import datetime  # noqa: F401

from pydantic import BaseModel, ConfigDict, field_validator, model_validator  # noqa: F401

from ..models import TYPES_DETENTEUR_VALIDES


class DetenteurBase(BaseModel):
    nom: str
    type: str  # "personne" | "societe"

    @field_validator("nom")
    @classmethod
    def _valider_nom(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Le nom ne peut pas être vide")
        return v

    @field_validator("type")
    @classmethod
    def _valider_type(cls, v: str) -> str:
        if v not in TYPES_DETENTEUR_VALIDES:
            raise ValueError(f"Type de détenteur invalide : doit être l'un de {TYPES_DETENTEUR_VALIDES}")
        return v


class DetenteurCreate(DetenteurBase):
    pass


class DetenteurUpdate(BaseModel):
    nom: str | None = None
    type: str | None = None

    @field_validator("nom")
    @classmethod
    def _valider_nom(cls, v: str | None) -> str | None:
        if v is None:
            return v
        v = v.strip()
        if not v:
            raise ValueError("Le nom ne peut pas être vide")
        return v

    @field_validator("type")
    @classmethod
    def _valider_type(cls, v: str | None) -> str | None:
        if v is not None and v not in TYPES_DETENTEUR_VALIDES:
            raise ValueError(f"Type de détenteur invalide : doit être l'un de {TYPES_DETENTEUR_VALIDES}")
        return v


class DetenteurOut(DetenteurBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
    updated_at: datetime


class QuotiteDetenteurItem(BaseModel):
    """Une ligne de la répartition d'un actif (backlog 2.L.1) : la quotité saisie,
    plus la part détenue/nette qui en découle — calculées côté serveur, jamais côté
    frontend (même discipline que `HoldingOut.valeur`/`LoanOut.capital_restant_du`)."""

    detenteur_id: int
    detenteur_nom: str
    quotite_pct: float
    part_detenue: float
    part_nette: float


class QuotiteEntree(BaseModel):
    """Une ligne envoyée par le client pour (re)définir la répartition d'un actif ou
    d'un emprunt — `PUT .../quotites`, remplacement intégral de l'ensemble existant."""

    detenteur_id: int
    quotite_pct: float

    @field_validator("quotite_pct")
    @classmethod
    def _valider_quotite(cls, v: float) -> float:
        if not (0 < v <= 100):
            raise ValueError("La quotité doit être strictement comprise entre 0 et 100")
        return v


class QuotitesUpdate(BaseModel):
    quotites: list[QuotiteEntree]
