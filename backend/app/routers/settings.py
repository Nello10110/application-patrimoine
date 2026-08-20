"""Réglages : configuration des tâches planifiées (activation, intervalle,
déclenchement manuel — non bloquant depuis le LOT 4B, cf. `run_job_now` ci-dessous)
et préférences applicatives (LOT 5B, cf. `get_preferences`/`update_preferences`
ci-dessous), consommés par la page Réglages du frontend."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import User
from ..schemas import Preferences, PreferencesUpdate, PreferencesUpdateResponse, ScheduledJobOut, ScheduledJobUpdate
from ..services import market_data_refresh, portfolio_reconstruction, preferences_service, scheduler_service

router = APIRouter(prefix="/api/settings", tags=["settings"])


@router.get("/preferences", response_model=Preferences)
def get_preferences(db: Session = Depends(get_db)):
    return Preferences(**preferences_service.lire_preferences(db))


@router.put("/preferences", response_model=PreferencesUpdateResponse)
def update_preferences(payload: PreferencesUpdate, db: Session = Depends(get_db)):
    """Changer la méthode de calcul du coût de revient change les gains réalisés et
    les prix de revient de TOUT le portefeuille (LOT 5.6) : quand `methode_cout`
    change réellement, on déclenche donc une reconstruction complète
    (`rebuild_holdings`, qui invalide déjà lui-même le cache d'historique — cf.
    `services/historique_cache.invalider`) et on renvoie le nombre de positions
    recalculées. Un simple changement du seuil d'alerte n'a, lui, aucun effet sur
    les positions : pas de reconstruction dans ce cas (`positions_recalculees`
    reste `None`).

    Préférences encore globales à ce stade (Milestone 2a, `Parametre` par
    utilisateur reste un Milestone 2b séparé — cf. `docs/BACKLOG.md` § 2.I.1) : un
    changement de méthode reconstruit donc le portefeuille de TOUS les comptes, pas
    seulement celui de qui a modifié le réglage."""
    ancienne_methode = preferences_service.lire_methode_cout(db)
    preferences_service.enregistrer_preferences(db, payload.methode_cout, payload.seuil_alerte_ecart_pct)

    positions_recalculees = None
    if payload.methode_cout != ancienne_methode:
        positions_recalculees = 0
        for (uid,) in db.query(User.id).all():
            resultat = portfolio_reconstruction.rebuild_holdings(db, uid)
            positions_recalculees += resultat.positions_recalculees

    return PreferencesUpdateResponse(
        methode_cout=payload.methode_cout,
        seuil_alerte_ecart_pct=payload.seuil_alerte_ecart_pct,
        positions_recalculees=positions_recalculees,
    )


@router.get("/jobs", response_model=list[ScheduledJobOut])
def list_jobs(db: Session = Depends(get_db)):
    return scheduler_service.list_jobs(db)


@router.put("/jobs/{job_key}", response_model=ScheduledJobOut)
def update_job(job_key: str, payload: ScheduledJobUpdate, db: Session = Depends(get_db)):
    if job_key not in scheduler_service.JOBS:
        raise HTTPException(status_code=404, detail="Tâche inconnue")
    return scheduler_service.update_job_config(db, job_key, payload.enabled, payload.intervalle_heures)


@router.post("/jobs/{job_key}/run-now", response_model=ScheduledJobOut, status_code=202)
def run_job_now(job_key: str, db: Session = Depends(get_db)):
    """Démarre l'exécution manuelle sans bloquer la requête (LOT 4B) : renvoie
    tout de suite la config actuelle (202, pas encore mise à jour par cette
    exécution). Le frontend suit la progression via
    `GET /api/market-data/refresh/status` (même exécuteur en tâche de fond que le
    bouton "Rafraîchir les cours" du Portefeuille, cf. `scheduler_service.run_job_now`)
    puis rappelle `GET /api/settings/jobs` une fois terminé pour rafraîchir
    "Dernière exécution"."""
    if job_key not in scheduler_service.JOBS:
        raise HTTPException(status_code=404, detail="Tâche inconnue")
    try:
        return scheduler_service.run_job_now(db, job_key)
    except market_data_refresh.RafraichissementDejaEnCoursError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
