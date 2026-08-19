"""Point d'entrée de l'API FastAPI : création du schéma, migrations, routeurs.
Application 100% locale (pas d'authentification) — CORS restreint au frontend Vite
tournant sur localhost."""

from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .database import (
    Base,
    SessionLocal,
    engine,
    migrate_recalculer_regions_en_cache,
    migrate_rename_categorie_autres,
    run_startup_migrations,
)
from .logging_config import configure_logging
from .routers import analysis, export, market_data, performance, portfolio, reference, settings, targets, transactions
from .services import scheduler_service, startup_maintenance

configure_logging()
Base.metadata.create_all(bind=engine)
run_startup_migrations()
migrate_rename_categorie_autres()
migrate_recalculer_regions_en_cache()

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

# Application 100% locale, prévue pour tourner uniquement contre le frontend Vite en
# développement local (`localhost`/`127.0.0.1:5173`) : aucun cookie/session n'est
# utilisé (pas d'authentification), donc pas de `allow_credentials`. Méthodes et
# en-têtes restreints à ce que le frontend utilise réellement plutôt que `"*"`
# (LOT 7.3) — `Content-Type` est le seul en-tête personnalisé envoyé par `client.ts`.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type"],
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


app.include_router(portfolio.router)
app.include_router(market_data.router)
app.include_router(targets.router)
app.include_router(analysis.router)
app.include_router(transactions.router)
app.include_router(performance.router)
app.include_router(settings.router)
app.include_router(export.router)
app.include_router(reference.router)


@app.get("/api/health")
def health():
    return {"status": "ok"}
