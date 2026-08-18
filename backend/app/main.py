"""Point d'entrée de l'API FastAPI : création du schéma, migrations, routeurs.
Application 100% locale (pas d'authentification) — CORS restreint au frontend Vite
tournant sur localhost."""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .database import Base, engine, run_startup_migrations
from .logging_config import configure_logging
from .routers import analysis, market_data, performance, portfolio, settings, targets, transactions
from .services import scheduler_service

configure_logging()
Base.metadata.create_all(bind=engine)
run_startup_migrations()


@asynccontextmanager
async def lifespan(app: FastAPI):
    scheduler_service.init_scheduler()
    yield
    scheduler_service.shutdown_scheduler()


app = FastAPI(title="Outil Bourse API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(portfolio.router)
app.include_router(market_data.router)
app.include_router(targets.router)
app.include_router(analysis.router)
app.include_router(transactions.router)
app.include_router(performance.router)
app.include_router(settings.router)


@app.get("/api/health")
def health():
    return {"status": "ok"}
