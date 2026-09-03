from __future__ import annotations

from datetime import datetime  # noqa: F401

from pydantic import BaseModel, ConfigDict, field_validator, model_validator  # noqa: F401


class EtablissementBase(BaseModel):
    nom: str

    @field_validator("nom")
    @classmethod
    def _valider_nom(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Le nom ne peut pas être vide")
        return v


class EtablissementCreate(EtablissementBase):
    pass


class EtablissementUpdate(BaseModel):
    nom: str | None = None

    @field_validator("nom")
    @classmethod
    def _valider_nom(cls, v: str | None) -> str | None:
        if v is None:
            return v
        v = v.strip()
        if not v:
            raise ValueError("Le nom ne peut pas être vide")
        return v


class EtablissementOut(EtablissementBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
    updated_at: datetime


class CompteBase(BaseModel):
    nom: str
    # `None` : aucun établissement rattaché (« Sans établissement » à l'écran) — pas
    # vérifié ici (pas d'accès DB dans un validateur Pydantic), l'IDOR est contrôlé
    # côté routeur/service, comme `LoanUpdate.holding_id`.
    etablissement_id: int | None = None

    @field_validator("nom")
    @classmethod
    def _valider_nom(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Le nom ne peut pas être vide")
        return v


class CompteCreate(CompteBase):
    # Établissement OBLIGATOIRE à la création (revue du 03/09/2026, demande directe
    # de l'utilisateur : « il n'est pas possible d'avoir des comptes sans
    # établissement »). Réécrit ici plutôt que sur `CompteBase`, dont hérite aussi
    # `CompteOut` : une LECTURE doit rester capable de représenter un compte déjà
    # existant sans établissement (créé avant cette règle) — seule la création est
    # cadrée par cette demande, pas la modification d'un compte existant.
    etablissement_id: int


class CompteUpdate(BaseModel):
    nom: str | None = None
    etablissement_id: int | None = None

    @field_validator("nom")
    @classmethod
    def _valider_nom(cls, v: str | None) -> str | None:
        if v is None:
            return v
        v = v.strip()
        if not v:
            raise ValueError("Le nom ne peut pas être vide")
        return v


class CompteOut(CompteBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    etablissement: EtablissementOut | None = None
    created_at: datetime
    updated_at: datetime


class CompteAvecSoldeOut(BaseModel):
    """Un compte avec sa valeur agrégée (`services/comptes_service.solde_par_compte`)
    — écran Comptes uniquement, jamais utilisé pour les routes CRUD nues. `compte`
    enveloppé (pas aplati sur `CompteOut`) : `None` représente le bucket « Sans
    compte » (lignes du foyer non rattachées), qui n'a pas d'existence en base."""

    compte: CompteOut | None
    solde: float
    nombre_lignes: int
