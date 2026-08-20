"""Modèles SQLAlchemy de l'application. Pas de vraies clés étrangères entre tables :
les relations se font par correspondance de `ticker` (l'identifiant ISIN/symbole),
car les positions sont entièrement reconstruites depuis `Transaction` à chaque
import (cf. `services/portfolio_reconstruction.py`) plutôt que gérées par CRUD
classique. Toute évolution de schéma est appliquée automatiquement au démarrage
par `database.run_startup_migrations` — voir ce module pour le détail.
"""

from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, UniqueConstraint
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
SOURCE_JUSTETF = "justetf"  # composition pays/secteurs réelle scrapée sur justetf.com (2.4, `services/justetf_service.py`)

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

# Types d'actifs valorisés manuellement (Phase 1 de `docs/ROADMAP.md`, patrimoine net
# façon Finary) : aucune tentative de cotation automatique n'a de sens pour eux — un
# bien immobilier ou un contrat d'assurance-vie n'a pas de ticker coté sur un marché.
# Leur valeur vient de `Holding.valeur_estimee`, saisie et mise à jour manuellement par
# l'utilisateur, jamais de `MarketDataCache`. En conséquence, ils sont exclus :
# - du rafraîchissement des cours (`market_data_service.refresh_tickers`) ;
# - du look-through géo/sectoriel, des objectifs et de la carte Rentabilité boursière
#   (`routers/analysis.py`, `services/performance_service.compute_performance`), qui
#   restent le périmètre du seul portefeuille FINANCIER, inchangé ;
# et inclus dans le patrimoine net global (`services/patrimoine_service.py`), qui est
# la somme de tout ce qui précède moins les emprunts (`Loan`).
TYPE_ACTIF_REAL_ESTATE = "REAL_ESTATE"
TYPE_ACTIF_SCPI = "SCPI"
TYPE_ACTIF_LIFE_INSURANCE = "LIFE_INSURANCE"
TYPE_ACTIF_PENSION = "PENSION"
# Catégorie résiduelle (roadmap Phase 2, § A.4) : objets de valeur, métaux précieux
# physiques, parts d'entreprise non cotée hors Private Equity déjà suivi — même
# mécanisme de valorisation manuelle que les quatre types ci-dessus, aucune nouvelle
# logique, juste une catégorie de plus pour ce qui ne rentre dans aucune case.
TYPE_ACTIF_OTHER_ASSET = "OTHER_ASSET"
TYPES_ACTIF_PATRIMOINE_MANUEL = {
    TYPE_ACTIF_REAL_ESTATE,
    TYPE_ACTIF_SCPI,
    TYPE_ACTIF_LIFE_INSURANCE,
    TYPE_ACTIF_PENSION,
    TYPE_ACTIF_OTHER_ASSET,
}


class Holding(Base):
    __tablename__ = "holdings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    ticker: Mapped[str] = mapped_column(String, index=True)
    nom: Mapped[str | None] = mapped_column(String, nullable=True)
    quantite: Mapped[float] = mapped_column(Float)
    prix_revient_moyen: Mapped[float | None] = mapped_column(Float, nullable=True)
    compte: Mapped[str | None] = mapped_column(String, nullable=True)
    devise: Mapped[str | None] = mapped_column(String, nullable=True)
    type_actif: Mapped[str | None] = mapped_column(String, nullable=True)  # STOCK | FUND | CRYPTO | BOND | PRIVATE_FUND | REAL_ESTATE | SCPI | LIFE_INSURANCE | PENSION
    origine: Mapped[str] = mapped_column(String, default=ORIGINE_RECONSTRUIT, server_default=ORIGINE_RECONSTRUIT)
    # Valorisation manuelle (colonnes additives, cf. `TYPES_ACTIF_PATRIMOINE_MANUEL`
    # ci-dessus) : `valeur_estimee` est un montant ABSOLU en euros (pas un prix par
    # part) qui, quand renseigné, remplace `prix_actuel * quantite` partout où une
    # ligne est valorisée (`analysis_service.value_holdings`) — `quantite` reste posée
    # à 1 par convention pour ces lignes, comme pour `PRIVATE_FUND` aujourd'hui.
    # `prix_revient_moyen` (champ déjà existant) porte le montant investi à l'origine,
    # ce qui permet un vrai calcul de gain (valeur_estimee vs prix_revient_moyen),
    # contrairement à `PRIVATE_FUND`/`BOND` qui restent valorisés à leur coût faute de
    # toute mise à jour possible.
    valeur_estimee: Mapped[float | None] = mapped_column(Float, nullable=True)
    date_valeur_estimee: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
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


class Loan(Base):
    """Emprunt (Phase 1 de `docs/ROADMAP.md`, patrimoine net façon Finary) — premier
    vrai PASSIF de l'application, jusqu'ici entièrement composée d'actifs. Le capital
    restant dû (`services/loan_service.compute_capital_restant_du`) est calculé par
    amortissement standard à taux fixe à partir de `capital_initial`/`taux_annuel_pct`/
    `mensualite`/`date_debut`/`duree_mois`, sauf si `capital_restant_du_manuel` est
    renseigné — un recalage explicite de l'utilisateur (relevé bancaire réel) prime
    alors sur le calcul théorique, qui peut dériver (remboursement anticipé, report
    d'échéance...). Table neuve, créée par `Base.metadata.create_all()`."""

    __tablename__ = "loans"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    libelle: Mapped[str] = mapped_column(String)
    capital_initial: Mapped[float] = mapped_column(Float)
    taux_annuel_pct: Mapped[float] = mapped_column(Float)
    mensualite: Mapped[float] = mapped_column(Float)
    date_debut: Mapped[datetime] = mapped_column(DateTime)
    duree_mois: Mapped[int] = mapped_column(Integer)
    capital_restant_du_manuel: Mapped[float | None] = mapped_column(Float, nullable=True)
    derniere_maj_manuelle: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)


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
    # Descriptif du fonds/ETF, alimenté uniquement pour `type_actif == "FUND"` par
    # `justetf_service.refresh_all` (2.4, Increment 9) — indépendant du succès de la
    # composition (cf. `FundCompositionBrute` ci-dessous) : présent même pour un ETF
    # sans onglet Holdings (réplication synthétique/ETC). Colonne additive, couverte
    # automatiquement par `database.run_startup_migrations`.
    description: Mapped[str | None] = mapped_column(String, nullable=True)
    # Frais de gestion annuels (TER) d'un fonds/ETF (roadmap Phase 3, § E.3), mis en
    # cache UNE SEULE FOIS par ticker (jamais recalculé ensuite, contrairement au
    # prix) — cf. `market_data_service.refresh_tickers`, qui ne l'interroge que tant
    # que cette colonne est `None` pour ne pas ralentir le rafraîchissement en masse.
    # Colonne additive, couverte automatiquement par `database.run_startup_migrations`.
    frais_gestion_pct: Mapped[float | None] = mapped_column(Float, nullable=True)
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


class FundCompositionBrute(Base):
    """Répartition géo/sectorielle BRUTE d'un fonds, telle qu'affichée par justETF
    (ex. "India" plutôt que "Marchés émergents") — affichage uniquement sur la fiche
    détaillée d'une position (2.4). Ne sert à aucun calcul agrégé du portefeuille :
    `FundComposition` (zones/secteurs internes) reste la seule source pour les
    graphiques et indicateurs du tableau de bord. Alimentée uniquement par justETF ;
    absente pour une position dont la composition n'est pas couverte (cf. 2.4)."""

    __tablename__ = "fund_composition_brute"
    __table_args__ = (UniqueConstraint("ticker", "type", "categorie", name="uq_fund_comp_brute_ticker_type_categorie"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    ticker: Mapped[str] = mapped_column(String, index=True)  # identifiant (ISIN) du fonds, cf. Holding.ticker
    type: Mapped[str] = mapped_column(String)  # "geo" | "sector"
    categorie: Mapped[str] = mapped_column(String)  # nom brut justETF (ex. "India", "Finance", "Other")
    poids: Mapped[float] = mapped_column(Float)  # fraction 0-1 de la valeur du fonds
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


class User(Base):
    """Compte utilisateur (multi-utilisateur, Milestone 1 — cf. `docs/BACKLOG.md` § 2.I.1).
    Aucune table métier (Holding, Loan, Transaction...) n'est encore scopée par
    `user_id` à ce stade : ce milestone pose uniquement l'authentification elle-même
    (se créer un compte, se connecter, protéger les routes existantes). L'isolation
    des données par utilisateur est un milestone séparé, volontairement pas fait en
    même temps que la connexion elle-même sur de vraies données financières."""

    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String, unique=True, index=True)
    # Format `pbkdf2_sha256$<iterations>$<sel>$<hash>` (cf. `services/auth_service.py`) :
    # le nombre d'itérations est stocké dans le hash lui-même, pour pouvoir l'augmenter
    # plus tard sans invalider les mots de passe déjà enregistrés.
    password_hash: Mapped[str] = mapped_column(String)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class AuthToken(Base):
    """Jeton de session opaque (pas de JWT : un simple `DELETE` suffit à le révoquer,
    pas de secret de signature à gérer). Vraie `ForeignKey` ici, contrairement au
    reste de ce fichier qui évite les FK à cause de la reconstruction du portefeuille
    depuis les transactions (cf. docstring de module) — sans rapport avec ce
    mécanisme, une FK classique est le choix naturel pour lier un jeton à son compte."""

    __tablename__ = "auth_tokens"

    token: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    expires_at: Mapped[datetime] = mapped_column(DateTime)
