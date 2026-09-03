from __future__ import annotations

from datetime import datetime  # noqa: F401

from pydantic import BaseModel, ConfigDict, field_validator, model_validator  # noqa: F401

# ---------------------------------------------------------------------------
# Budget (backlog 2.N.1/2.N.2)
# ---------------------------------------------------------------------------


class CategorieBudgetOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    nom: str
    parent_id: int | None = None


class CategorieBudgetCreate(BaseModel):
    nom: str
    parent_id: int | None = None

    @field_validator("nom")
    @classmethod
    def _valider_nom(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Le nom de la catégorie ne peut pas être vide")
        return v


class CategorieBudgetUpdate(BaseModel):
    nom: str

    @field_validator("nom")
    @classmethod
    def _valider_nom(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Le nom de la catégorie ne peut pas être vide")
        return v


class RegleCategorisationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    motif: str
    categorie_id: int


class RegleCategorisationCreate(BaseModel):
    motif: str
    categorie_id: int

    @field_validator("motif")
    @classmethod
    def _valider_motif(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Le motif ne peut pas être vide")
        return v


class RegleReapplicationResult(BaseModel):
    mouvements_modifies: int


class MouvementBancaireOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    date: str
    libelle: str
    montant: float
    compte: str | None = None
    categorie_id: int | None = None
    categorise_manuellement: bool


class MouvementCategorisationUpdate(BaseModel):
    categorie_id: int | None = None


class BudgetColumnMapping(BaseModel):
    file_token: str
    date_col: str
    libelle_col: str
    montant_col: str | None = None
    debit_col: str | None = None
    credit_col: str | None = None
    compte: str | None = None

    @field_validator("date_col", "libelle_col")
    @classmethod
    def _valider_colonne_obligatoire(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("La colonne est obligatoire")
        return v

    @model_validator(mode="after")
    def _valider_montant_ou_debit_credit(self) -> BudgetColumnMapping:
        if not self.montant_col and not (self.debit_col or self.credit_col):
            raise ValueError("Indique une colonne montant, ou au moins une colonne débit/crédit")
        return self


class BudgetImportResult(BaseModel):
    lignes_lues: int
    importees: int
    doublons_ignores: int
    lignes_ignorees: int
    categorisees_automatiquement: int


class BudgetCibleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    categorie_id: int
    montant_mensuel: float


class BudgetCibleUpdate(BaseModel):
    montant_mensuel: float

    @field_validator("montant_mensuel")
    @classmethod
    def _valider_montant_positif(cls, v: float) -> float:
        if v < 0:
            raise ValueError("Le budget cible ne peut pas être négatif")
        return v


class RepartitionSortieItem(BaseModel):
    categorie_id: int | None
    categorie_nom: str
    montant: float
    cible_mensuelle: float | None = None


class BudgetSummary(BaseModel):
    entrees: float
    sorties: float
    disponible: float
    depenses_recurrentes_mensuelles: float
    repartition_sorties: list[RepartitionSortieItem]


class RecurrenceDetecteeOut(BaseModel):
    libelle: str
    categorie_id: int | None
    montant_actuel: float
    montant_precedent: float | None
    hausse_prix: bool
    occurrences: int
    premiere_date: str
    derniere_date: str
    periodicite: str


class JonctionPatrimoine(BaseModel):
    taux_epargne_reel_pct: float | None
    reste_a_vivre: float | None
    versement_mensuel_suggere: float | None
    versement_mensuel_epargne_declare: float
    categorie_epargne_introuvable: bool
    categorie_logement_introuvable: bool
