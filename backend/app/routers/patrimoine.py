"""Patrimoine net global (Phase 1 de `docs/ROADMAP.md`) — actifs moins passifs sur
*tout* le patrimoine (portefeuille financier + immobilier/SCPI/assurance-vie/PER),
distinct des écrans d'analyse existants qui restent scopés au seul portefeuille
financier (`services/patrimoine_service.py`).

Sert aussi de capital de départ par défaut à l'écran Simulateur (fusion
Simulateur/Outils) : la projection, le tableau de détail et le calcul FIRE sont
calculés côté client (`frontend/src/utils/interetsComposes.ts`) — ce module
n'expose donc plus que le patrimoine net lui-même, plus d'endpoint
`/simulation`/`/fire` dédié."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..auth import get_current_user, require_role
from ..database import get_db
from ..models import ROLE_INVITE, ROLE_MEMBRE, ROLE_PROPRIETAIRE, Detenteur, User
from ..schemas import ExpositionConsolidee, PatrimoineNetResponse
from ..services import auth_service, detenteurs_service, patrimoine_service

router = APIRouter(prefix="/api/patrimoine", tags=["patrimoine"])

# Exposition consolidée (backlog 2.P.1) : nouvel écran d'analyse, hors des trois
# écrans ouverts à l'invité par L.2 (Patrimoine net/Portefeuille/Emprunts) — ce
# routeur reste `_protegee` dans `main.py` pour `/net`, restreint ici à
# propriétaire+membre pour cette seule route.
_pas_invite = require_role(ROLE_PROPRIETAIRE, ROLE_MEMBRE)


@router.get("/net", response_model=PatrimoineNetResponse)
def get_patrimoine_net(
    detenteur_id: int | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if detenteur_id is not None:
        detenteur = db.get(Detenteur, detenteur_id)
        if detenteur is None or detenteur.user_id != auth_service.id_foyer(current_user):
            raise HTTPException(status_code=404, detail="Détenteur introuvable")
    if current_user.role == ROLE_INVITE:
        # Un invité (2.L.2) n'a jamais accès à la vue Foyer consolidée : le
        # `detenteur_id` demandé doit être explicitement dans son périmètre assigné.
        perimetre = detenteurs_service.perimetre_invite(db, current_user.id)
        if detenteur_id is None or detenteur_id not in perimetre:
            raise HTTPException(status_code=403, detail="Détenteur hors de votre périmètre")
    return PatrimoineNetResponse(**patrimoine_service.compute_patrimoine_net(db, auth_service.id_foyer(current_user), detenteur_id))


@router.get("/exposition-consolidee", response_model=ExpositionConsolidee)
def get_exposition_consolidee(db: Session = Depends(get_db), current_user: User = Depends(_pas_invite)):
    return patrimoine_service.compute_exposition_consolidee(db, auth_service.id_foyer(current_user))
