"""Point d'entrée de l'API FastAPI : mise à jour du schéma, routeurs.
Application multi-utilisateur depuis le Milestone 1 (cf. `docs/BACKLOG.md` § 2.I.1) :
toutes les routes hormis `/api/auth/{register,login}` et `/api/health` exigent d'être
connecté — CORS restreint à une liste d'origines explicite (dev local par défaut,
`PATRIMOINE_CORS_ORIGINS` pour un déploiement Docker, cf. `compose-exemple.yaml`)."""

import os
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .auth import get_current_user, require_role
from .database import SessionLocal, upgrade_schema
from .logging_config import configure_logging
from .models import ROLE_MEMBRE, ROLE_PROPRIETAIRE
from .routers import (
    analysis,
    auth,
    budget,
    comptes,
    detenteurs,
    export,
    loans,
    market_data,
    objectifs,
    partage,
    partage_public,
    patrimoine,
    performance,
    portfolio,
    reference,
    salaire,
    settings,
    transactions,
)
from .services import scheduler_service, startup_maintenance

configure_logging()
# Alembic (backlog 2.I.4) : crée le schéma sur une base neuve, ou l'amène à jour sur
# une base existante — un seul appel remplace l'ancien duo `Base.metadata.create_all()`
# + fonctions de migration maison (cf. docstring de `upgrade_schema`).
upgrade_schema()

# Après les migrations de schéma et de contenu : remise à niveau du portefeuille
# reconstruit si les règles de calcul ont changé depuis la dernière reconstruction
# (cf. `services/startup_maintenance` pour le pourquoi — sans ça, les prix de revient
# stockés restent ceux de l'ancienne version jusqu'au prochain import).
_db_demarrage = SessionLocal()
try:
    startup_maintenance.reconstruire_si_regles_de_calcul_modifiees(_db_demarrage)
finally:
    _db_demarrage.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    scheduler_service.init_scheduler()
    yield
    scheduler_service.shutdown_scheduler()


app = FastAPI(title="Application Patrimoine API", lifespan=lifespan)

# Origines autorisées : les deux ports de dev par défaut, ou `PATRIMOINE_CORS_ORIGINS`
# (liste séparée par des virgules) pour un déploiement Docker où le frontend n'est pas
# servi sur ces ports. Reste volontairement une liste explicite plutôt que `"*"`
# (LOT 7.3) — piloter la liste ne change pas la philosophie, juste son emplacement.
# Note : avec le déploiement Docker de référence (`compose-exemple.yaml`), nginx sert
# le frontend ET reverse-proxy `/api/` vers le backend sous la MÊME origine navigateur
# — aucune requête cross-origin réelle dans ce cas, cette liste ne sert alors qu'en
# repli pour un accès direct au backend.
_ORIGINES_CORS_DEFAUT = ["http://localhost:5173", "http://127.0.0.1:5173"]
_origines_cors_env = os.environ.get("PATRIMOINE_CORS_ORIGINS")
_origines_cors = [o.strip() for o in _origines_cors_env.split(",") if o.strip()] if _origines_cors_env else _ORIGINES_CORS_DEFAUT

# Le jeton de session (Milestone 1) est transporté en en-tête `Authorization: Bearer
# ...`, jamais en cookie, donc `allow_credentials` reste `False`. Méthodes et en-têtes
# restreints à ce que le frontend utilise réellement plutôt que `"*"` — `Content-Type`
# et `Authorization` sont les deux seuls en-têtes personnalisés envoyés par `client.ts`.
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origines_cors,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)


@app.exception_handler(RequestValidationError)
async def gestion_erreurs_validation(request: Request, exc: RequestValidationError) -> JSONResponse:
    """Renvoie les erreurs de validation Pydantic (payload malformé, contraintes
    métier violées via un `field_validator`/`model_validator` de `schemas.py`) en
    `400` plutôt que le `422` par défaut de FastAPI (LOT 3.1/3.2) — ce projet ne
    distingue pas les deux à l'usage, et le frontend (`api/client.ts`) traite déjà
    tout code d'erreur HTTP en lisant `detail` comme un message à afficher tel quel.
    Seule la première erreur est retenue : largement suffisant pour un formulaire de
    saisie où l'utilisateur corrige un champ à la fois."""
    premiere = exc.errors()[0] if exc.errors() else {}
    message = premiere.get("msg", "Requête invalide")
    prefixe = "Value error, "
    if message.startswith(prefixe):
        message = message[len(prefixe) :]
    return JSONResponse(status_code=400, content={"detail": message})


app.include_router(auth.router)
# Consultation d'un lien de partage (backlog 2.Q.1) : aucune authentification,
# comme `auth.router` — la protection de cette route est le jeton opaque dans
# l'URL (et le code optionnel), jamais un compte connecté.
app.include_router(partage_public.router)

# Protégées : toutes exigent un jeton valide (Milestone 1). Au-delà de la simple
# authentification, les rôles (backlog 2.L.2) restreignent certains routeurs
# entièrement au propriétaire, ou au propriétaire+membre (invité exclu) — appliqué
# ici au niveau `include_router` pour les routeurs à granularité uniforme ;
# `portfolio.py`/`loans.py`/`patrimoine.py` restent protégés seulement par
# `_protegee` ici et affinent eux-mêmes au niveau endpoint (lecture ouverte aux 3
# rôles avec filtrage serveur pour l'invité, écriture réservée propriétaire+membre).
_protegee = [Depends(get_current_user)]
_proprietaire_seul = [Depends(require_role(ROLE_PROPRIETAIRE))]
_pas_invite = [Depends(require_role(ROLE_PROPRIETAIRE, ROLE_MEMBRE))]

app.include_router(portfolio.router, dependencies=_protegee)
# Écran Comptes (backlog X.1) : même granularité que portfolio.py/loans.py
# ci-dessous — lecture ouverte aux 3 rôles avec filtrage serveur pour l'invité,
# écriture (CRUD établissements/comptes, quotités) réservée propriétaire+membre,
# affinée au niveau endpoint dans `routers/comptes.py`.
app.include_router(comptes.router, dependencies=_protegee)
app.include_router(market_data.router, dependencies=_pas_invite)
app.include_router(analysis.router, dependencies=_pas_invite)
app.include_router(transactions.router, dependencies=_pas_invite)
app.include_router(performance.router, dependencies=_pas_invite)
app.include_router(settings.router, dependencies=_proprietaire_seul)
app.include_router(export.router, dependencies=_proprietaire_seul)
app.include_router(reference.router, dependencies=_protegee)
app.include_router(loans.router, dependencies=_protegee)
app.include_router(patrimoine.router, dependencies=_protegee)
app.include_router(detenteurs.router, dependencies=_proprietaire_seul)
app.include_router(budget.router, dependencies=_pas_invite)
app.include_router(objectifs.router, dependencies=_proprietaire_seul)
app.include_router(partage.router, dependencies=_proprietaire_seul)
app.include_router(salaire.router, dependencies=_proprietaire_seul)


@app.get("/api/health")
def health():
    return {"status": "ok"}
