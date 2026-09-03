from __future__ import annotations

from datetime import datetime  # noqa: F401

from pydantic import BaseModel, ConfigDict, field_validator, model_validator  # noqa: F401

# ---------------------------------------------------------------------------
# Objectifs suivis et indicateurs de situation (backlog 2.O.1/2.O.2)
# ---------------------------------------------------------------------------


class ObjectifCreate(BaseModel):
    nom: str
    type: str = "personnalise"
    montant_cible: float
    echeance: str
    rendement_hypothese_pct: float = 0.0
    holding_ids: list[int] = []
    detenteur_ids: list[int] = []

    @field_validator("nom")
    @classmethod
    def _valider_nom(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Le nom de l'objectif ne peut pas être vide")
        return v

    @field_validator("montant_cible")
    @classmethod
    def _valider_montant(cls, v: float) -> float:
        if v <= 0:
            raise ValueError("Le montant cible doit être strictement positif")
        return v

    @field_validator("echeance")
    @classmethod
    def _valider_echeance(cls, v: str) -> str:
        """`echeance` est une chaîne (jamais convertie en `date` côté schéma, pour
        rester symétrique de `ObjectifDetail.echeance`) : sans ce contrôle, une
        chaîne illisible traversait jusqu'au calcul de trajectoire, et une échéance
        déjà passée produisait une contribution mensuelle nécessaire divisée par un
        nombre de mois nul ou négatif (recette du 02/09/2026). Un objectif se
        projette forcément dans l'avenir — le suivi d'un objectif atteint se lit
        dans sa progression, pas dans une échéance rétroactive."""
        try:
            jour = datetime.strptime(v, "%Y-%m-%d").date()
        except ValueError:
            raise ValueError("L'échéance doit être au format AAAA-MM-JJ") from None
        if jour <= datetime.now().date():
            raise ValueError("L'échéance doit être dans le futur")
        return v


class ActifRattacheOut(BaseModel):
    holding_id: int
    ticker: str
    nom: str | None = None


class ContributeurObjectifOut(BaseModel):
    id: int
    nom: str


class TrajectoirePoint(BaseModel):
    date: str
    valeur: float


class ObjectifDetail(BaseModel):
    id: int
    nom: str
    type: str
    montant_cible: float
    echeance: str
    rendement_hypothese_pct: float
    created_at: datetime
    valeur_a_la_creation: float
    valeur_actuelle: float
    progression_pct: float | None
    diagnostic: str
    retard_mois: int | None
    rendement_requis_pct: float | None
    contribution_mensuelle_necessaire: float | None
    trajectoire_cible: list[TrajectoirePoint]
    trajectoire_reelle: list[TrajectoirePoint]
    actifs_rattaches: list[ActifRattacheOut]
    contributeurs: list[ContributeurObjectifOut]
