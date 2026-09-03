from __future__ import annotations

from datetime import datetime  # noqa: F401

from pydantic import BaseModel, ConfigDict, field_validator, model_validator  # noqa: F401

from ..services.preferences_service import METHODES_VALIDES


class ScheduledJobOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    job_key: str
    enabled: bool
    intervalle_heures: float
    derniere_execution: datetime | None = None
    dernier_statut: str | None = None
    dernier_message: str | None = None


class ScheduledJobUpdate(BaseModel):
    enabled: bool
    intervalle_heures: float

    @field_validator("intervalle_heures")
    @classmethod
    def _valider_intervalle(cls, v: float) -> float:
        if not (0.25 <= v <= 168):
            raise ValueError("L'intervalle doit être compris entre 0,25 heure (15 minutes) et 168 heures (une semaine)")
        return v


class Preferences(BaseModel):
    """Réglages applicatifs persistants (LOT 5B), cf. `services/preferences_service.py`."""

    methode_cout: str  # "cout_moyen_pondere" | "fifo"
    # Taux d'imposition SAISI (backlog 2.Q.2) : une donnée reprise telle quelle dans
    # la déclaration de patrimoine, jamais un calcul fiscal — cf. `docs/BACKLOG.md` § 3.
    taux_imposition_pct: float | None = None


class PreferencesUpdate(BaseModel):
    methode_cout: str
    taux_imposition_pct: float | None = None

    @field_validator("methode_cout")
    @classmethod
    def _valider_methode(cls, v: str) -> str:
        if v not in METHODES_VALIDES:
            raise ValueError(f"Méthode de calcul du coût de revient invalide : doit être l'une de {METHODES_VALIDES}")
        return v

    @field_validator("taux_imposition_pct")
    @classmethod
    def _valider_taux_imposition(cls, v: float | None) -> float | None:
        if v is not None and not (0 <= v <= 100):
            raise ValueError("Le taux d'imposition doit être compris entre 0 et 100")
        return v


class PreferencesUpdateResponse(Preferences):
    """Réponse de `PUT /api/settings/preferences` : les préférences enregistrées,
    plus le nombre de positions recalculées si le changement a déclenché une
    reconstruction du portefeuille (LOT 5.6 — uniquement quand `methode_cout`
    change réellement, `None` sinon)."""

    positions_recalculees: int | None = None
