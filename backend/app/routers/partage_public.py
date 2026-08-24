"""Consultation PUBLIQUE d'un lien de partage (backlog 2.Q.1) — AUCUNE
authentification. Volontairement isolé de `routers/partage.py` (gestion, réservée
au propriétaire) pour qu'aucune dépendance d'authentification ne puisse s'y
glisser par erreur ; enregistré directement dans `main.py`
(`app.include_router(partage_public.router)`, comme `auth.router`), jamais via
`_protegee`/`_proprietaire_seul`."""

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from ..database import get_db
from ..schemas import PartageAccesRequest, PartagePayload
from ..services import partage_service

router = APIRouter(prefix="/api/partage-public", tags=["partage-public"])

MESSAGE_LIEN_INTROUVABLE = "Ce lien de partage est introuvable, expiré, ou a été révoqué."


def _adresse_client(request: Request) -> str | None:
    return request.client.host if request.client else None


@router.get("/{token}/meta")
def meta(token: str, db: Session = Depends(get_db)):
    """Ne compte jamais comme une tentative de code (aucun code n'est vérifié ici) —
    sert uniquement au frontend public à savoir s'il doit afficher un champ code
    avant de tenter `POST /{token}`."""
    lien = partage_service.lien_valide_par_token(db, token)
    if lien is None:
        raise HTTPException(status_code=404, detail=MESSAGE_LIEN_INTROUVABLE)
    return {"nom_lien": lien.nom, "code_requis": lien.code_hash is not None}


@router.post("/{token}", response_model=PartagePayload)
def consulter(token: str, payload: PartageAccesRequest, request: Request, db: Session = Depends(get_db)):
    ip = _adresse_client(request)
    lien = partage_service.lien_valide_par_token(db, token)
    if lien is None:
        raise HTTPException(status_code=404, detail=MESSAGE_LIEN_INTROUVABLE)
    verrouille_jusqua = partage_service.verrouillage_actif(db, lien.id)
    if verrouille_jusqua is not None:
        raise HTTPException(status_code=429, detail=f"Trop de tentatives. Réessayez après {verrouille_jusqua.strftime('%H:%M UTC')}.")
    if not partage_service.verifier_code(lien, payload.code):
        partage_service.journaliser_acces(db, lien.id, ip, "code_incorrect")
        raise HTTPException(status_code=401, detail="Code incorrect.")
    partage_service.journaliser_acces(db, lien.id, ip, "succes")
    return PartagePayload(**partage_service.compute_payload(db, lien))
