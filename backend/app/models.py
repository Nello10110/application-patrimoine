"""Modèles SQLAlchemy de l'application. Pas de vraies clés étrangères entre tables :
les relations se font par correspondance de `ticker` (l'identifiant ISIN/symbole),
car les positions sont entièrement reconstruites depuis `Transaction` à chaque
import (cf. `services/portfolio_reconstruction.py`) plutôt que gérées par CRUD
classique. Toute évolution de schéma est appliquée automatiquement au démarrage
par `database.run_startup_migrations` — voir ce module pour le détail.
"""

from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Float, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


# Qualification de l'origine d'une ligne `FundComposition.source` (cf. 2.1) : permet
# de distinguer, dans l'API et à l'écran, une répartition mesurée d'une répartition
# estimée. L'absence de ligne en base (aucune des deux) signale une donnée
# indisponible — elle n'a donc pas de constante dédiée, seule son absence compte.
SOURCE_COMPOSITION = "composition"  # lignes réelles du fonds (Yahoo top_holdings / sector_weightings)
SOURCE_INDICE = "indice"  # déduite du nom du fonds via reference_indices.repartition_geo_depuis_le_nom

# Qualification de `Holding.origine` (cf. LOT 3.4) : arbitre le conflit entre saisie
# manuelle et reconstruction automatique depuis le grand livre de transactions. Une
# ligne "manuel" (créée à la main ou importée depuis un relevé de positions) survit
# à un `rebuild_holdings` ; une ligne "reconstruit" en est le résultat et peut donc
# en être librement supprimée/recréée. Valeur par défaut : ORIGINE_RECONSTRUIT, posée
# aussi bien côté Python (nouvelles lignes créées par le code) que côté base
# (`server_default`, cf. `database.run_startup_migrations`) — les lignes d'une base
# existante, créées avant l'ajout de cette colonne, sont donc traitées comme
# reconstruites : c'est la réalité de l'immense majorité des utilisateurs, dont le
# portefeuille est entièrement issu d'un import de transactions.
ORIGINE_MANUEL = "manuel"
ORIGINE_RECONSTRUIT = "reconstruit"


class Holding(Base):
    __tablename__ = "holdings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    ticker: Mapped[str] = mapped_column(String, index=True)
    nom: Mapped[str | None] = mapped_column(String, nullable=True)
    quantite: Mapped[float] = mapped_column(Float)
    prix_revient_moyen: Mapped[float | None] = mapped_column(Float, nullable=True)
    compte: Mapped[str | None] = mapped_column(String, nullable=True)
    devise: Mapped[str | None] = mapped_column(String, nullable=True)
    type_actif: Mapped[str | None] = mapped_column(String, nullable=True)  # STOCK | FUND | CRYPTO | BOND | PRIVATE_FUND
    origine: Mapped[str] = mapped_column(String, default=ORIGINE_RECONSTRUIT, server_default=ORIGINE_RECONSTRUIT)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)

    # `lazy="selectin"` (cf. LOT 4.1) : sans stratégie de chargement explicite, SQLAlchemy
    # émet une requête PAR ligne dès que `.market_data` est accédé (N+1 — une requête par
    # position affichée). `selectin` charge, en UNE requête `WHERE ticker IN (...)`, les
    # `MarketDataCache` de tout un lot de `Holding` déjà chargés : le nombre de requêtes ne
    # dépend donc plus du nombre de lignes du portefeuille.
    market_data: Mapped["MarketDataCache"] = relationship(
        "MarketDataCache",
        primaryjoin="foreign(MarketDataCache.ticker) == Holding.ticker",
        uselist=False,
        viewonly=True,
        lazy="selectin",
    )


class MarketDataCache(Base):
    __tablename__ = "market_data_cache"

    ticker: Mapped[str] = mapped_column(String, primary_key=True)
    nom: Mapped[str | None] = mapped_column(String, nullable=True)
    prix_actuel: Mapped[float | None] = mapped_column(Float, nullable=True)
    devise: Mapped[str | None] = mapped_column(String, nullable=True)
    secteur: Mapped[str | None] = mapped_column(String, nullable=True)
    pays: Mapped[str | None] = mapped_column(String, nullable=True)
    region: Mapped[str | None] = mapped_column(String, nullable=True)
    erreur: Mapped[str | None] = mapped_column(String, nullable=True)
    derniere_maj: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)


class AllocationTarget(Base):
    __tablename__ = "allocation_targets"
    __table_args__ = (UniqueConstraint("annee", "type", "categorie", name="uq_target_annee_type_categorie"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    annee: Mapped[int] = mapped_column(Integer, index=True)
    type: Mapped[str] = mapped_column(String)  # "geo" | "sector"
    categorie: Mapped[str] = mapped_column(String)
    pourcentage_cible: Mapped[float] = mapped_column(Float)


class Transaction(Base):
    __tablename__ = "transactions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    transaction_id: Mapped[str] = mapped_column(String, unique=True, index=True)
    datetime_utc: Mapped[datetime] = mapped_column(DateTime, index=True)
    date: Mapped[str] = mapped_column(String)
    category: Mapped[str] = mapped_column(String, index=True)
    type: Mapped[str] = mapped_column(String, index=True)
    asset_class: Mapped[str | None] = mapped_column(String, nullable=True)
    symbol: Mapped[str | None] = mapped_column(String, nullable=True, index=True)
    name: Mapped[str | None] = mapped_column(String, nullable=True)
    shares: Mapped[float | None] = mapped_column(Float, nullable=True)
    price: Mapped[float | None] = mapped_column(Float, nullable=True)
    amount: Mapped[float] = mapped_column(Float)
    fee: Mapped[float] = mapped_column(Float, default=0.0)
    tax: Mapped[float] = mapped_column(Float, default=0.0)
    description: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class TickerResolution(Base):
    __tablename__ = "ticker_resolution"

    identifiant: Mapped[str] = mapped_column(String, primary_key=True)
    ticker_resolu: Mapped[str | None] = mapped_column(String, nullable=True)
    quote_type: Mapped[str | None] = mapped_column(String, nullable=True)
    resolue_le: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)


class FundComposition(Base):
    """Répartition géo/sectorielle interne d'un fonds/ETF (look-through), recalculée
    à chaque rafraîchissement des cours — jamais figée dans le temps."""

    __tablename__ = "fund_composition"
    __table_args__ = (UniqueConstraint("ticker", "type", "categorie", name="uq_fund_comp_ticker_type_categorie"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    ticker: Mapped[str] = mapped_column(String, index=True)  # identifiant (ISIN) du fonds, cf. Holding.ticker
    type: Mapped[str] = mapped_column(String)  # "geo" | "sector"
    categorie: Mapped[str] = mapped_column(String)
    poids: Mapped[float] = mapped_column(Float)  # fraction 0-1 de la valeur du fonds
    # Origine de la ligne : SOURCE_COMPOSITION (données réelles du fonds) ou
    # SOURCE_INDICE (estimée à partir du nom de l'indice suivi, cf. 2.1). Nullable
    # pour les lignes posées avant l'ajout de cette colonne (migration ADD COLUMN) ;
    # elles sont de toute façon recalculées à chaque rafraîchissement des cours.
    source: Mapped[str | None] = mapped_column(String, nullable=True)
    derniere_maj: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)


class FundTopHolding(Base):
    """Détail des principales actions composant un fonds/ETF (look-through nominatif),
    recalculé à chaque rafraîchissement des cours — jamais figé dans le temps."""

    __tablename__ = "fund_top_holdings"
    __table_args__ = (UniqueConstraint("ticker", "holding_symbol", name="uq_fund_top_holding_ticker_symbol"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    ticker: Mapped[str] = mapped_column(String, index=True)  # identifiant (ISIN) du fonds, cf. Holding.ticker
    holding_symbol: Mapped[str] = mapped_column(String)  # ticker Yahoo de l'action sous-jacente
    holding_nom: Mapped[str | None] = mapped_column(String, nullable=True)
    poids: Mapped[float] = mapped_column(Float)  # fraction 0-1 de la valeur du fonds
    pays: Mapped[str | None] = mapped_column(String, nullable=True)
    secteur: Mapped[str | None] = mapped_column(String, nullable=True)
    derniere_maj: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)


class HistoriqueCache(Base):
    """Cache persistant des séries d'historique de prix coûteuses à recalculer
    (historique d'une ligne, historique du portefeuille — cf. LOT 4.4/4.5), géré
    exclusivement par `services/historique_cache.py` (clé, sérialisation JSON,
    durée de validité). Table créée automatiquement au démarrage comme les autres,
    via `Base.metadata.create_all`."""

    __tablename__ = "historique_cache"

    cle: Mapped[str] = mapped_column(String, primary_key=True)
    contenu_json: Mapped[str] = mapped_column(String)
    derniere_maj: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)


class ScheduledJobConfig(Base):
    """Configuration d'une tâche planifiée (cf. `services/scheduler_service.py`),
    éditable depuis l'écran Réglages."""

    __tablename__ = "scheduled_job_config"

    job_key: Mapped[str] = mapped_column(String, primary_key=True)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    intervalle_heures: Mapped[float] = mapped_column(Float, default=24.0)
    derniere_execution: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    dernier_statut: Mapped[str | None] = mapped_column(String, nullable=True)  # "ok" | "erreur"
    dernier_message: Mapped[str | None] = mapped_column(String, nullable=True)


class Parametre(Base):
    """Table de configuration générique clé/valeur (LOT 5B), pour les réglages
    applicatifs qui ne concernent pas une tâche planifiée (cf. `ScheduledJobConfig`,
    dédié à celles-ci et à leur suivi d'exécution). `valeur` est volontairement un
    simple texte : la conversion (booléen, nombre, énumération contrainte...) et la
    valeur par défaut d'un réglage absent sont la responsabilité de
    `services/preferences_service.py`, seul module qui expose des accesseurs typés
    et nommés par réglage — jamais un `get(cle)` générique laissé aux appelants.
    Une application locale mono-utilisateur n'a pas besoin d'un schéma de
    configuration typé en base (une colonne dédiée par réglage) : ce choix évite
    surtout une migration (`database.run_startup_migrations`) à chaque nouveau
    réglage — l'ajout d'un réglage n'ajoute qu'une ligne de données, jamais une
    colonne de schéma."""

    __tablename__ = "parametres"

    cle: Mapped[str] = mapped_column(String, primary_key=True)
    valeur: Mapped[str] = mapped_column(String)
