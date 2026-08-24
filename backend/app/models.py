"""Modèles SQLAlchemy de l'application. Pas de vraies clés étrangères entre tables :
les relations se font par correspondance de `ticker` (l'identifiant ISIN/symbole),
car les positions sont entièrement reconstruites depuis `Transaction` à chaque
import (cf. `services/portfolio_reconstruction.py`) plutôt que gérées par CRUD
classique. Toute évolution de schéma est appliquée automatiquement au démarrage par
`database.upgrade_schema()` (Alembic, backlog 2.I.4) — voir `backend/alembic/versions/`
pour l'historique des révisions.
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
# (`server_default`, appliqué à l'ajout de cette colonne) — les lignes d'une base
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
    # Multi-utilisateur (Milestone 2a, cf. docs/BACKLOG.md § 2.I.1) : les lignes
    # existantes au moment de l'introduction de cette colonne ont été rétro-remplies
    # au compte demo (migration ponctuelle, appliquée une fois — l'historique
    # complet vit désormais dans `backend/alembic/versions/`) — le code applicatif
    # la traite comme toujours renseignée dès qu'une ligne est créée ou lue via
    # l'API (jamais `None` en pratique).
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
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
    # Multi-utilisateur (Milestone 2a) — cf. docstring équivalente sur `Holding.user_id`.
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    libelle: Mapped[str] = mapped_column(String)
    capital_initial: Mapped[float] = mapped_column(Float)
    taux_annuel_pct: Mapped[float] = mapped_column(Float)
    mensualite: Mapped[float] = mapped_column(Float)
    date_debut: Mapped[datetime] = mapped_column(DateTime)
    duree_mois: Mapped[int] = mapped_column(Integer)
    capital_restant_du_manuel: Mapped[float | None] = mapped_column(Float, nullable=True)
    derniere_maj_manuelle: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    # Rattachement à un actif (backlog 2.M.2, version minimale — un emprunt vers au
    # plus un actif, pas encore de clé de répartition multi-actifs) : condition
    # nécessaire pour que la "part nette" par détenteur (2.L.1) ait un sens, un
    # emprunt non rattaché ne pouvant être imputé à aucune ligne du patrimoine.
    # Vraie FK (comme `user_id`) : ce rattachement est une vraie relation CRUD, pas
    # une correspondance issue de la reconstruction du grand livre (cf. docstring de
    # module).
    holding_id: Mapped[int | None] = mapped_column(ForeignKey("holdings.id"), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)


class Detenteur(Base):
    """Personne (conjoint, enfant...) ou société (SCI, holding...) du foyer, déclarée
    une fois et réutilisée pour répartir la propriété des actifs et des emprunts
    (backlog 2.L.1) — distincte de `User` (compte de connexion) : un enfant mineur
    peut être détenteur d'une quotité sans jamais avoir de compte."""

    __tablename__ = "detenteurs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    nom: Mapped[str] = mapped_column(String)
    type: Mapped[str] = mapped_column(String)  # "personne" | "societe"
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)


class QuotiteHolding(Base):
    """Quotité de propriété (%) d'un détenteur sur une ligne du portefeuille (backlog
    2.L.1). L'ensemble des lignes d'un même `holding_id` doit sommer à 100 %
    (contrôlé côté service, `services/detenteurs_service.py` — pas en base, SQLite ne
    permettant pas simplement une contrainte inter-lignes). L'absence de toute ligne
    pour un `holding_id` signifie un actif non réparti, implicitement 100 % foyer
    (comportement historique inchangé, cf. `patrimoine_service.compute_patrimoine_net`)."""

    __tablename__ = "quotites_holdings"
    __table_args__ = (UniqueConstraint("holding_id", "detenteur_id", name="uq_quotite_holding_detenteur"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    holding_id: Mapped[int] = mapped_column(ForeignKey("holdings.id"), index=True)
    detenteur_id: Mapped[int] = mapped_column(ForeignKey("detenteurs.id"), index=True)
    quotite_pct: Mapped[float] = mapped_column(Float)


class QuotiteLoan(Base):
    """Quotité de propriété (%) d'un détenteur sur un emprunt (backlog 2.L.1) —
    indépendante de la quotité de l'actif rattaché (`Loan.holding_id`) : un emprunt
    peut avoir été contracté par un seul conjoint pour un bien détenu à deux. Quand
    aucune ligne n'existe pour un `loan_id` rattaché, la part nette hérite par défaut
    des quotités de l'actif (cf. `services/detenteurs_service.compute_parts`)."""

    __tablename__ = "quotites_loans"
    __table_args__ = (UniqueConstraint("loan_id", "detenteur_id", name="uq_quotite_loan_detenteur"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    loan_id: Mapped[int] = mapped_column(ForeignKey("loans.id"), index=True)
    detenteur_id: Mapped[int] = mapped_column(ForeignKey("detenteurs.id"), index=True)
    quotite_pct: Mapped[float] = mapped_column(Float)


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
    # automatiquement à l'ajout de cette colonne.
    description: Mapped[str | None] = mapped_column(String, nullable=True)
    # Frais de gestion annuels (TER) d'un fonds/ETF (roadmap Phase 3, § E.3), mis en
    # cache UNE SEULE FOIS par ticker (jamais recalculé ensuite, contrairement au
    # prix) — cf. `market_data_service.refresh_tickers`, qui ne l'interroge que tant
    # que cette colonne est `None` pour ne pas ralentir le rafraîchissement en masse.
    # Colonne additive, couverte automatiquement à l'ajout de cette colonne.
    frais_gestion_pct: Mapped[float | None] = mapped_column(Float, nullable=True)
    derniere_maj: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)


class AllocationTarget(Base):
    __tablename__ = "allocation_targets"
    __table_args__ = (UniqueConstraint("user_id", "annee", "type", "categorie", name="uq_target_user_annee_type_categorie"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    # Multi-utilisateur (Milestone 2a) — cf. docstring équivalente sur `Holding.user_id`.
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    annee: Mapped[int] = mapped_column(Integer, index=True)
    type: Mapped[str] = mapped_column(String)  # "geo" | "sector"
    categorie: Mapped[str] = mapped_column(String)
    pourcentage_cible: Mapped[float] = mapped_column(Float)


class Transaction(Base):
    __tablename__ = "transactions"
    # Multi-utilisateur (Milestone 2a) : l'unicité de `transaction_id` (identifiant
    # émis par le courtier) devient relative à un utilisateur — deux utilisateurs
    # avec des comptes courtier différents peuvent avoir des `transaction_id` qui se
    # recoupent par coïncidence sans que ce soit un doublon. Remplace l'ancien
    # `unique=True` sur la seule colonne `transaction_id` (Milestone 2a, backlog 2.I.1).
    __table_args__ = (UniqueConstraint("transaction_id", "user_id", name="uq_transaction_user_transaction_id"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    # Multi-utilisateur (Milestone 2a) — cf. docstring équivalente sur `Holding.user_id`.
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    transaction_id: Mapped[str] = mapped_column(String, index=True)
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
    GLOBAUX qui ne concernent ni un utilisateur particulier ni une tâche planifiée
    (cf. `ScheduledJobConfig`, dédié à celles-ci). Depuis le Milestone 2b
    (multi-utilisateur, `docs/BACKLOG.md` § 2.I.1), les réglages propres à un
    utilisateur (méthode de coût de revient, seuil d'alerte) vivent dans
    `UserParametre` — cette table ne sert plus qu'à `startup_maintenance`
    (`version_calcul_portefeuille`, un marqueur de version du CODE, pas une
    préférence : il doit rester unique pour toute l'installation, jamais par
    compte). `valeur` est volontairement un simple texte : la conversion (booléen,
    nombre, énumération contrainte...) est la responsabilité de l'appelant."""

    __tablename__ = "parametres"

    cle: Mapped[str] = mapped_column(String, primary_key=True)
    valeur: Mapped[str] = mapped_column(String)


class UserParametre(Base):
    """Réglages applicatifs propres à un utilisateur (LOT 5B, devenu par-utilisateur
    au Milestone 2b — `docs/BACKLOG.md` § 2.I.1) : méthode de calcul du coût de
    revient, seuil d'alerte de rééquilibrage. Table dédiée plutôt qu'un `user_id`
    nullable ajouté à `Parametre` : `Parametre` garde un seul réglage réellement
    global (`version_calcul_portefeuille`), mélanger les deux dans une même table
    aurait exigé une clé primaire composite avec `user_id` NULL pour les lignes
    globales — plus confus qu'une seconde table, pour un coût de migration
    identique (table neuve, créée par `Base.metadata.create_all`, sans `ALTER
    TABLE`). Mêmes accesseurs typés que `Parametre` (`services/preferences_service.py`,
    seul point d'accès) — jamais un `get(cle)` générique laissé aux appelants."""

    __tablename__ = "user_parametres"

    cle: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), primary_key=True)
    valeur: Mapped[str] = mapped_column(String)


ROLE_PROPRIETAIRE = "proprietaire"
ROLE_MEMBRE = "membre"
ROLE_INVITE = "invite"
ROLES_VALIDES = (ROLE_PROPRIETAIRE, ROLE_MEMBRE, ROLE_INVITE)


class User(Base):
    """Compte utilisateur (multi-utilisateur, Milestone 1 — cf. `docs/BACKLOG.md` § 2.I.1).
    Rôles (backlog 2.L.2) : un `proprietaire` est son propre foyer (`owner_user_id`
    `None`) ; un `membre`/`invite` est rattaché au foyer d'un propriétaire via
    `owner_user_id` — toutes les données qu'il consulte/crée restent stockées sous
    `owner_user_id` (cf. `services/auth_service.id_foyer`), jamais sous son propre
    `id`. Un foyer reste donc un unique `user_id` métier, cohérent avec toute
    l'isolation par `user_id` déjà en place (Milestone 2a/2b)."""

    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    # Pseudo, pas une adresse email (LOT multi-utilisateur suite) : reste le seul
    # IDENTIFIANT DE CONNEXION (mot de passe local ET SSO) — plus simple à retenir/
    # afficher pour une appli locale entre quelques comptes d'un même foyer, où
    # aucune fonctionnalité (récupération de mot de passe par email...) n'a jamais
    # dépendu du format email. `email`/`nom` ci-dessous sont de pures métadonnées
    # d'affichage (backlog SSO — claim mapping), jamais utilisées pour se connecter.
    username: Mapped[str] = mapped_column(String, unique=True, index=True)
    # Format `pbkdf2_sha256$<iterations>$<sel>$<hash>` (cf. `services/auth_service.py`) :
    # le nombre d'itérations est stocké dans le hash lui-même, pour pouvoir l'augmenter
    # plus tard sans invalider les mots de passe déjà enregistrés. `None` pour un
    # compte purement SSO (backlog SSO) : pas de mot de passe local utilisable,
    # `POST /api/auth/login` le refuse explicitement dans ce cas.
    password_hash: Mapped[str | None] = mapped_column(String, nullable=True)
    role: Mapped[str] = mapped_column(String, default=ROLE_PROPRIETAIRE, server_default=ROLE_PROPRIETAIRE)
    owner_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    # Identifiant stable (`sub`) renvoyé par le fournisseur SSO (OIDC) une fois ce
    # compte lié à une identité — jamais le nom d'utilisateur ou l'email, qui peuvent
    # changer côté fournisseur ; seule clé de liaison fiable dans la durée.
    oidc_subject: Mapped[str | None] = mapped_column(String, nullable=True, unique=True, index=True)
    # Métadonnées d'affichage pures (backlog SSO, claim mapping configurable — cf.
    # `services/oidc_service.py`), resynchronisées à chaque connexion SSO. `None`
    # pour un compte mot de passe local, ou si le claim mappé est absent de la
    # réponse du fournisseur. Jamais uniques, jamais utilisées pour l'authentification.
    email: Mapped[str | None] = mapped_column(String, nullable=True)
    nom: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class PerimetreInvite(Base):
    """Détenteurs auxquels un compte `invite` (2.L.2) a accès en lecture — un invité
    sans aucune ligne ici ne voit aucun actif (périmètre vide par défaut, jamais
    "tout le foyer" implicitement)."""

    __tablename__ = "perimetres_invites"
    __table_args__ = (UniqueConstraint("user_id", "detenteur_id", name="uq_perimetre_invite_user_detenteur"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    detenteur_id: Mapped[int] = mapped_column(ForeignKey("detenteurs.id"), index=True)


class AuthToken(Base):
    """Jeton de session opaque (pas de JWT : un simple `DELETE` suffit à le révoquer,
    pas de secret de signature à gérer). Vraie `ForeignKey` ici, contrairement au
    reste de ce fichier qui évite les FK à cause de la reconstruction du portefeuille
    depuis les transactions (cf. docstring de module) — sans rapport avec ce
    mécanisme, une FK classique est le choix naturel pour lier un jeton à son compte.
    `id_session` (2.L.2) est l'identifiant PUBLIC de la session, renvoyé par
    `GET /api/auth/sessions` et utilisé pour la révocation individuelle — jamais
    `token` lui-même (le secret porteur), qui ne doit plus jamais réapparaître dans
    une réponse une fois émis."""

    __tablename__ = "auth_tokens"

    token: Mapped[str] = mapped_column(String, primary_key=True)
    id_session: Mapped[str] = mapped_column(String, nullable=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    expires_at: Mapped[datetime] = mapped_column(DateTime)
    derniere_utilisation: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    ip: Mapped[str | None] = mapped_column(String, nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String, nullable=True)


class AccessLogEntry(Base):
    """Journal d'accès (2.L.2), consultable dans Réglages par le propriétaire —
    alimente aussi le calcul de verrouillage temporaire (`auth_service.verrouillage_actif`),
    qui relit ces lignes plutôt que de maintenir un compteur séparé (une seule source
    de vérité). `username_saisi` est conservé même si le compte n'existe pas (tentative
    sur un identifiant inconnu) — c'est justement ce qu'un journal d'accès doit montrer."""

    __tablename__ = "access_log_entries"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)
    username_saisi: Mapped[str] = mapped_column(String)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    ip: Mapped[str | None] = mapped_column(String, nullable=True)
    action: Mapped[str] = mapped_column(String)  # "login" | "logout"
    resultat: Mapped[str] = mapped_column(String)  # "succes" | "echec"
    raison: Mapped[str | None] = mapped_column(String, nullable=True)
