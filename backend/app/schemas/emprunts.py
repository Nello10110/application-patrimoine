from __future__ import annotations

from datetime import datetime  # noqa: F401

from pydantic import BaseModel, ConfigDict, field_validator, model_validator  # noqa: F401


class LoanBase(BaseModel):
    """Emprunt (Phase 1 de `docs/ROADMAP.md`, patrimoine net) — cf. `models.Loan`."""

    libelle: str
    capital_initial: float
    taux_annuel_pct: float
    mensualite: float
    date_debut: datetime
    duree_mois: int
    capital_restant_du_manuel: float | None = None

    @field_validator("libelle")
    @classmethod
    def _valider_libelle(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Le libellé de l'emprunt ne peut pas être vide")
        return v

    @field_validator("capital_initial")
    @classmethod
    def _valider_capital_initial(cls, v: float) -> float:
        if v <= 0:
            raise ValueError("Le capital initial doit être strictement positif")
        return v

    @field_validator("taux_annuel_pct")
    @classmethod
    def _valider_taux(cls, v: float) -> float:
        if v < 0:
            raise ValueError("Le taux annuel ne peut pas être négatif")
        return v

    @field_validator("mensualite")
    @classmethod
    def _valider_mensualite(cls, v: float) -> float:
        if v <= 0:
            raise ValueError("La mensualité doit être strictement positive")
        return v

    @field_validator("duree_mois")
    @classmethod
    def _valider_duree(cls, v: int) -> int:
        if v <= 0:
            raise ValueError("La durée doit être strictement positive (en mois)")
        return v

    @field_validator("capital_restant_du_manuel")
    @classmethod
    def _valider_capital_restant_du_manuel(cls, v: float | None) -> float | None:
        if v is not None and v < 0:
            raise ValueError("Le capital restant dû ne peut pas être négatif")
        return v


class LoanCreate(LoanBase):
    pass


class LoanUpdate(BaseModel):
    libelle: str | None = None
    capital_initial: float | None = None
    taux_annuel_pct: float | None = None
    mensualite: float | None = None
    date_debut: datetime | None = None
    duree_mois: int | None = None
    capital_restant_du_manuel: float | None = None
    # Rattachement à un actif (backlog 2.M.2) — champ à part (pas dans `LoanBase`, non
    # demandé à la création) : `None` explicite dans le corps de la requête signifie
    # "dérattacher", absence du champ signifie "ne pas toucher" (cf. `routers/loans.py`,
    # exclude_unset=True).
    holding_id: int | None = None

    @field_validator("libelle")
    @classmethod
    def _valider_libelle(cls, v: str | None) -> str | None:
        if v is None:
            return v
        v = v.strip()
        if not v:
            raise ValueError("Le libellé de l'emprunt ne peut pas être vide")
        return v

    @field_validator("capital_initial")
    @classmethod
    def _valider_capital_initial(cls, v: float | None) -> float | None:
        if v is not None and v <= 0:
            raise ValueError("Le capital initial doit être strictement positif")
        return v

    @field_validator("taux_annuel_pct")
    @classmethod
    def _valider_taux(cls, v: float | None) -> float | None:
        if v is not None and v < 0:
            raise ValueError("Le taux annuel ne peut pas être négatif")
        return v

    @field_validator("mensualite")
    @classmethod
    def _valider_mensualite(cls, v: float | None) -> float | None:
        if v is not None and v <= 0:
            raise ValueError("La mensualité doit être strictement positive")
        return v

    @field_validator("duree_mois")
    @classmethod
    def _valider_duree(cls, v: int | None) -> int | None:
        if v is not None and v <= 0:
            raise ValueError("La durée doit être strictement positive (en mois)")
        return v

    @field_validator("capital_restant_du_manuel")
    @classmethod
    def _valider_capital_restant_du_manuel(cls, v: float | None) -> float | None:
        if v is not None and v < 0:
            raise ValueError("Le capital restant dû ne peut pas être négatif")
        return v


class LoanOut(LoanBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    derniere_maj_manuelle: datetime | None = None
    created_at: datetime
    updated_at: datetime
    # Calculé côté serveur (`loan_service.compute_capital_restant_du`) — jamais recalculé
    # côté frontend, même raison que `HoldingOut.valeur` (LOT 6.7) : une seule source de
    # vérité pour un chiffre qui compte (c'est un passif du patrimoine net). Pas une
    # colonne de `models.Loan` : la valeur par défaut ci-dessous n'existe que pour que
    # `model_validate(loan)` réussisse (`from_attributes=True` exige l'attribut) avant
    # d'être systématiquement écrasée par `routers/loans._vers_loan_out`.
    capital_restant_du: float = 0.0
    holding_id: int | None = None
