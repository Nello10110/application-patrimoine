"""Point d'entrée de l'API FastAPI : mise à jour du schéma, routeurs.
Application locale, multi-utilisateur depuis le Milestone 1 (cf. `docs/BACKLOG.md`
§ 2.I.1) : toutes les routes hormis `/api/auth/{register,login}` et `/api/health`
exigent d'être connecté — CORS restreint au frontend Vite tournant sur localhost."""

from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .auth import get_current_user
from .database import SessionLocal, upgrade_schema
from .logging_config import configure_logging
from .routers import analysis, auth, export, loans, market_data, patrimoine, performance, portfolio, reference, settings, targets, transactions
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

# Application locale, prévue pour tourner uniquement contre le frontend Vite en
# développement local (`localhost`/`127.0.0.1:5173`) : le jeton de session (Milestone
# 1) est transporté en en-tête `Authorization: Bearer ...`, jamais en cookie, donc
# `allow_credentials` reste `False`. Méthodes et en-têtes restreints à ce que le
# frontend utilise réellement plutôt que `"*"` (LOT 7.3) — `Content-Type` et
# `Authorization` sont les deux seuls en-têtes personnalisés envoyés par `client.ts`.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
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

# Protégées : toutes exigent un jeton valide. Passé au niveau de `include_router`
# plutôt que sur chaque endpoint individuellement (LOT Milestone 1) — aucun de ces
# routeurs n'a encore besoin de savoir QUI est connecté tant qu'aucune donnée n'est
# scopée par utilisateur (cf. `docs/BACKLOG.md` § 2.I.1, Milestone 2).
_protegee = [Depends(get_current_user)]
app.include_router(portfolio.router, dependencies=_protegee)
app.include_router(market_data.router, dependencies=_protegee)
app.include_router(targets.router, dependencies=_protegee)
app.include_router(analysis.router, dependencies=_protegee)
app.include_router(transactions.router, dependencies=_protegee)
app.include_router(performance.router, dependencies=_protegee)
app.include_router(settings.router, dependencies=_protegee)
app.include_router(export.router, dependencies=_protegee)
app.include_router(reference.router, dependencies=_protegee)
app.include_router(loans.router, dependencies=_protegee)
app.include_router(patrimoine.router, dependencies=_protegee)


@app.get("/api/health")
def health():
    return {"status": "ok"}
