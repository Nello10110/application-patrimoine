from __future__ import annotations

from datetime import datetime  # noqa: F401

from pydantic import BaseModel, ConfigDict, field_validator, model_validator  # noqa: F401

from ..services.salaire_service import PERIODICITES_VALIDES, STATUTS_VALIDES, TYPES_MONTANT_VALIDES


class SalaireIn(BaseModel):
    """Saisie d'UNE entrée de salaire (plusieurs entrées possibles par année, ex. un
    revenu par conjoint — chacune avec son propre taux d'imposition), cf.
    `services/salaire_service.py`."""

    annee: int
    nom: str | None = None
    montant: float
    type_montant: str  # "brut" | "net"
    periodicite: str  # "mensuel" | "annuel"
    statut: str  # "cadre" | "non_cadre"
    nombre_mois: int = 12
    taux_imposition_pct: float | None = None

    @field_validator("annee")
    @classmethod
    def _valider_annee(cls, v: int) -> int:
        if not (2000 <= v <= 2100):
            raise ValueError("L'année doit être comprise entre 2000 et 2100")
        return v

    @field_validator("nom")
    @classmethod
    def _valider_nom(cls, v: str | None) -> str | None:
        if v is None:
            return None
        return v.strip() or None

    @field_validator("montant")
    @classmethod
    def _valider_montant(cls, v: float) -> float:
        if v <= 0:
            raise ValueError("Le montant doit être strictement positif")
        return v

    @field_validator("type_montant")
    @classmethod
    def _valider_type_montant(cls, v: str) -> str:
        if v not in TYPES_MONTANT_VALIDES:
            raise ValueError(f"Type de montant invalide : doit être l'un de {TYPES_MONTANT_VALIDES}")
        return v

    @field_validator("periodicite")
    @classmethod
    def _valider_periodicite(cls, v: str) -> str:
        if v not in PERIODICITES_VALIDES:
            raise ValueError(f"Périodicité invalide : doit être l'une de {PERIODICITES_VALIDES}")
        return v

    @field_validator("statut")
    @classmethod
    def _valider_statut(cls, v: str) -> str:
        if v not in STATUTS_VALIDES:
            raise ValueError(f"Statut invalide : doit être l'un de {STATUTS_VALIDES}")
        return v

    @field_validator("nombre_mois")
    @classmethod
    def _valider_nombre_mois(cls, v: int) -> int:
        if not (1 <= v <= 24):
            raise ValueError("Le nombre de versements par an doit être compris entre 1 et 24")
        return v

    @field_validator("taux_imposition_pct")
    @classmethod
    def _valider_taux_imposition(cls, v: float | None) -> float | None:
        if v is not None and not (0 <= v <= 100):
            raise ValueError("Le taux d'imposition doit être compris entre 0 et 100")
        return v


class SalaireResume(BaseModel):
    """Résultat calculé du calculateur brut/net pour UNE entrée de salaire, cf.
    `services/salaire_service.resume_depuis_ligne`."""

    id: int
    annee: int
    nom: str
    montant: float
    type_montant: str
    periodicite: str
    statut: str
    nombre_mois: int
    taux_imposition_pct: float | None
    brut_annuel: float
    brut_mensuel_moyen: float
    brut_par_versement: float
    net_avant_impot_annuel: float
    net_avant_impot_mensuel_moyen: float
    net_avant_impot_par_versement: float
    net_apres_impot_annuel: float | None
    net_apres_impot_mensuel_moyen: float | None


class SyntheseAnnee(BaseModel):
    """Agrégat de TOUTES les entrées de salaire d'une année — taux d'épargne du foyer,
    cf. `services/salaire_service.compute_synthese_annee`."""

    annee: int
    nombre_salaires: int
    net_total_annuel: float
    toutes_les_entrees_ont_un_taux_imposition: bool
    montant_investi_annee: float
    taux_epargne_pct: float | None


class SalaireDonnees(BaseModel):
    """Réponse complète de `GET /api/salaire/` : toutes les entrées (pour l'édition) et
    la synthèse de chaque année où au moins une entrée existe (pour l'historique)."""

    entrees: list[SalaireResume]
    syntheses: list[SyntheseAnnee]
