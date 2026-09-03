from __future__ import annotations

from datetime import datetime  # noqa: F401

from pydantic import BaseModel, ConfigDict, field_validator, model_validator  # noqa: F401


class DeclarationPatrimoineRequest(BaseModel):
    """Backlog 2.Q.2 — `services/declaration_patrimoine_service.generer_pdf_declaration`.
    `holding_ids`/`loan_ids` à `None` = toutes les lignes du foyer ; une liste (même
    vide) restreint explicitement la sélection."""

    holding_ids: list[int] | None = None
    loan_ids: list[int] | None = None
    detenteur_id: int | None = None
    destinataire: str | None = None
    inclure_profil: bool = False

    @field_validator("destinataire")
    @classmethod
    def _valider_destinataire(cls, v: str | None) -> str | None:
        return v.strip() or None if v else None
