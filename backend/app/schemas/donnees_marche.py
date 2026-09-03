from __future__ import annotations

from datetime import datetime  # noqa: F401

from pydantic import BaseModel, ConfigDict, field_validator, model_validator  # noqa: F401


class MarketDataOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    ticker: str
    nom: str | None = None
    prix_actuel: float | None = None
    devise: str | None = None
    secteur: str | None = None
    pays: str | None = None
    region: str | None = None
    erreur: str | None = None
    derniere_maj: datetime


class EtatRafraichissement(BaseModel):
    """État du rafraîchissement des cours en tâche de fond (LOT 4B). Renvoyé par
    `POST /api/market-data/refresh` (202, état de démarrage) et
    `GET /api/market-data/refresh/status` (sondé par le frontend pendant que
    `en_cours` vaut `True`, notamment depuis la page Réglages — `POST
    /api/settings/jobs/{job_key}/run-now` déclenche le même exécuteur partagé,
    cf. `services/scheduler_service.run_job_now`)."""

    en_cours: bool
    positions_traitees: int
    positions_total: int
    demarre_le: datetime | None = None
    termine_le: datetime | None = None
    statut: str | None = None  # "ok" | "erreur" | None (jamais terminé, ou en cours)
    message: str | None = None
