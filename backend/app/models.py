"""Modèles SQLAlchemy de l'application. Pas de vraies clés étrangères entre tables :
les relations se font par correspondance de `ticker` (l'identifiant ISIN/symbole),
car les positions sont entièrement reconstruites depuis `Transaction` à chaque
import (cf. `services/portfolio_reconstruction.py`) plutôt que gérées par CRUD
classique. Toute évolution de schéma est appliquée automatiquement au démarrage par
`database.upgrade_schema()` (Alembic, backlog 2.I.4) — voir `backend/alembic/versions/`
pour l'historique des révisions.
"""

from datetime import UTC, datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Index, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def utcnow() -> datetime:
    return datetime.now(UTC)


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
# Taxonomie élargie (roadmap Lot 5, backlog § 2.M.1) : quatre natures qui manquaient
# au foyer réel — mêmes mécanisme et exclusions que les types ci-dessus (valorisation
# manuelle via `valeur_estimee`, jamais de cotation automatique).
TYPE_ACTIF_CASH_ACCOUNT = "CASH_ACCOUNT"  # compte courant (établissement/détenteur : `compte` existant + quotités L.1)
TYPE_ACTIF_REGULATED_SAVINGS = "REGULATED_SAVINGS"  # Livret A, LDDS, LEP, PEL, CEL...
TYPE_ACTIF_EMPLOYEE_SAVINGS = "EMPLOYEE_SAVINGS"  # PEE, PERCO, PER entreprise
TYPE_ACTIF_VEHICLE = "VEHICLE"  # véhicule, décote annuelle via `taux_pct` (négatif)
TYPES_ACTIF_PATRIMOINE_MANUEL = {
    TYPE_ACTIF_REAL_ESTATE,
    TYPE_ACTIF_SCPI,
    TYPE_ACTIF_LIFE_INSURANCE,
    TYPE_ACTIF_PENSION,
    TYPE_ACTIF_OTHER_ASSET,
    TYPE_ACTIF_CASH_ACCOUNT,
    TYPE_ACTIF_REGULATED_SAVINGS,
    TYPE_ACTIF_EMPLOYEE_SAVINGS,
    TYPE_ACTIF_VEHICLE,
}

# Sous-ensemble de `TYPES_ACTIF_PATRIMOINE_MANUEL` dispensé de compte (revue du
# 03/09/2026, demande directe de l'utilisateur : « les seules lignes sans
# établissement doivent être l'immobilier et ce genre de choses »). Un bien
# (immobilier, véhicule) n'est détenu par aucun établissement financier ; une SCPI,
# une assurance-vie, un PER, un livret ou un compte courant, si — ce sont des
# produits financiers réels, `EpargnePage` leur crée d'ailleurs déjà un `Compte` 1:1
# automatiquement. `OTHER_ASSET` reste dans l'ensemble exempté : c'est l'échappatoire
# explicite pour ce qui ne rentre dans aucune case, même esprit que l'immobilier/le
# véhicule. Utilisé par `HoldingCreate`/`routers/portfolio.py::update_holding`/
# `comptes_service.compter_holdings_sans_compte` — TOUJOURS depuis cette seule
# définition, jamais redupliquée en dur ailleurs.
TYPES_ACTIF_SANS_ETABLISSEMENT = {
    TYPE_ACTIF_REAL_ESTATE,
    TYPE_ACTIF_VEHICLE,
    TYPE_ACTIF_OTHER_ASSET,
}
# Sous-ensemble ci-dessus dédié à l'écran Épargne (backlog § 2.S.1) : comptes et
# contrats d'épargne au sens large, dont l'utilisateur pilote lui-même la
# valorisation dans le temps (historique daté) et, optionnellement, un versement
# mensuel récurrent. Volontairement SANS `REAL_ESTATE`/`SCPI` (fiche immobilier
# dédiée déjà existante), `OTHER_ASSET` (résiduel) ni `VEHICLE` (décote, pas
# épargne — rapprochement futur de l'immobilier, décision actée avec l'utilisateur
# le 25/08/2026, cf. `docs/BACKLOG.md` § 2.S.1).
TYPES_EPARGNE = {
    TYPE_ACTIF_CASH_ACCOUNT,
    TYPE_ACTIF_REGULATED_SAVINGS,
    TYPE_ACTIF_EMPLOYEE_SAVINGS,
    TYPE_ACTIF_LIFE_INSURANCE,
    TYPE_ACTIF_PENSION,
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
    # Compte structurel (écran Comptes, backlog X.1) — remplace l'ancienne
    # annotation texte libre (`compte: str | None`, retirée par la migration
    # `ajoute_etablissements_comptes_structurels`, backfillée en de vraies lignes
    # `Compte`). `None` : ligne non rattachée à un compte (« Sans compte » à
    # l'écran), état permanent et normal, pas une phase transitoire. Un compte peut
    # rattacher plusieurs `Holding` (ex. un CTO avec plusieurs actions) ; un actif
    # valorisé manuellement (immobilier, assurance-vie...) a en pratique SA PROPRE
    # ligne de compte (1:1), sans que le schéma ne l'impose.
    compte_id: Mapped[int | None] = mapped_column(ForeignKey("comptes.id"), nullable=True, index=True)
    devise: Mapped[str | None] = mapped_column(String, nullable=True)
    # Chaîne libre, pas un enum SQL : la liste des valeurs connues vit dans
    # `patrimoine_service.LABEL_TYPE_ACTIF` (source unique, jamais dupliquée ici en
    # commentaire — cette énumération avait déjà dérivé une fois par le passé).
    type_actif: Mapped[str | None] = mapped_column(String, nullable=True)
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
    # Taux annuel purement informatif (backlog § 2.M.1) : positif = taux d'intérêt
    # attendu (épargne réglementée/salariale), négatif = décote annuelle attendue
    # (véhicules). Jamais appliqué automatiquement à `valeur_estimee` — sert
    # uniquement à calculer une "valeur projetée dans 1 an" affichée côté frontend,
    # que l'utilisateur reporte lui-même dans `valeur_estimee` s'il le souhaite (même
    # philosophie que la valorisation immobilière datée : jamais de mutation
    # silencieuse d'une donnée financière).
    taux_pct: Mapped[float | None] = mapped_column(Float, nullable=True)
    # Zone géographique déclarée pour un actif valorisé manuellement (backlog 2.P.1,
    # exposition consolidée tous actifs) : une des 6 zones de `reference_indices`
    # (jamais une granularité par pays — cohérent avec le zonage déjà utilisé partout
    # ailleurs dans l'app). Sans objet pour un actif financier, dont la géographie
    # vient déjà du look-through/de la cotation (`analysis_service.value_holdings`
    # ignore ce champ dans ce cas). `None` par défaut : `value_holdings` retombe alors
    # sur `ZONE_EUROPE` (hypothèse la plus probable pour un immobilier/une
    # assurance-vie française) plutôt que de laisser un "Non catégorisé" qui rendrait
    # la fonctionnalité inutilisable sur les lignes déjà saisies avant son ajout.
    zone_geo: Mapped[str | None] = mapped_column(String, nullable=True)
    # Versement mensuel récurrent DÉCLARÉ par l'utilisateur (backlog § 2.S.1, écran
    # Épargne) — sans objet en dehors de `TYPES_EPARGNE`. Même philosophie que
    # `taux_pct` : jamais déduit automatiquement (aucune détection depuis le grand
    # livre de transactions, qui ne couvre de toute façon pas les virements bancaires,
    # cf. increment 5). Additionné à `versement_mensuel_suggere` du Simulateur
    # (`services/budget_service.compute_jonction_patrimoine`), jamais fusionné en base.
    versement_mensuel: Mapped[float | None] = mapped_column(Float, nullable=True)
    # Date d'ACQUISITION du bien (achat de l'appartement, souscription du contrat...),
    # déclarée par l'utilisateur — à ne pas confondre avec `created_at` (date à laquelle
    # la LIGNE a été saisie dans l'application, souvent bien après l'achat réel) ni
    # `date_valeur_estimee` (date de la dernière mise à jour de l'estimation de valeur).
    # `None` par défaut : aucune valeur inventée pour les lignes déjà saisies avant
    # l'ajout de ce champ.
    date_acquisition: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
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
    # `lazy="selectin"` : même raison que `market_data` ci-dessus — évite le N+1 sur
    # `list_holdings`/l'agrégation solde-par-compte (`comptes_service.solde_par_compte`).
    compte: Mapped["Compte | None"] = relationship("Compte", lazy="selectin")


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
    # Établissement du CRÉDIT (revue du 03/09/2026, demande directe de l'utilisateur :
    # « j'aimerais bien indiquer l'établissement du crédit mais pour autant
    # l'immobilier ou le bien ne fait pas partie de l'établissement »). Délibérément
    # DÉCOUPLÉ de `holding_id` : le bien financé peut n'appartenir à aucun
    # établissement (cas normal d'un immobilier, cf. `TYPES_ACTIF_SANS_ETABLISSEMENT`)
    # pendant que sa banque prêteuse, elle, en a un. Nullable et non exigé à la
    # création, contrairement à `Compte.etablissement_id` : l'utilisateur a formulé
    # cette demande plus doucement (« j'aimerais bien indiquer », pas « il faut »),
    # et l'imposer rétroactivement à un emprunt déjà saisi serait de la friction sans
    # contrepartie.
    etablissement_id: Mapped[int | None] = mapped_column(ForeignKey("etablissements.id"), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)


class HoldingImmobilierDetail(Base):
    """Détail immobilier (backlog § 2.M.3), un par `Holding` — table séparée plutôt
    que des colonnes de plus sur `Holding` : ces champs (loyer, DPE, surface...)
    n'ont de sens que pour un `type_actif == "REAL_ESTATE"`, en faire des colonnes de
    `Holding` aurait pollué les ~9 autres types sans aucun bénéfice. `holding_id`
    UNIQUE : au plus une fiche immobilière par ligne, créée/mise à jour via
    `PUT /api/portfolio/holdings/{ticker}/immobilier`."""

    __tablename__ = "holding_immobilier_details"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    holding_id: Mapped[int] = mapped_column(ForeignKey("holdings.id"), unique=True, index=True)
    type_location: Mapped[str | None] = mapped_column(String, nullable=True)  # nue, meublée, Pinel, LMNP... texte libre
    loyer_mensuel: Mapped[float | None] = mapped_column(Float, nullable=True)
    charges_mensuelles: Mapped[float | None] = mapped_column(Float, nullable=True)
    # Agrégat volontaire (taxe foncière + copropriété + assurance + gestion) plutôt
    # que quatre colonnes séparées : le backlog ne demande qu'un total pour le calcul
    # de rentabilité, pas un suivi ligne à ligne de chaque poste.
    frais_annuels: Mapped[float | None] = mapped_column(Float, nullable=True)
    surface_m2: Mapped[float | None] = mapped_column(Float, nullable=True)
    nb_pieces: Mapped[int | None] = mapped_column(Integer, nullable=True)
    annee_construction: Mapped[int | None] = mapped_column(Integer, nullable=True)
    dpe: Mapped[str | None] = mapped_column(String, nullable=True)  # A à G, texte libre (pas d'enum : tolère "NC" etc.)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)


class HoldingValuationHistory(Base):
    """Historique des valorisations manuelles (backlog § 2.M.3) : chaque changement de
    `Holding.valeur_estimee` ajoute une ligne ICI plutôt que d'écraser la précédente
    — alimente une courbe de valorisation dans le temps au lieu de présenter une
    estimation comme un fait figé (défaut relevé chez Finary, cf. backlog § 1.2).
    `Holding.valeur_estimee`/`date_valeur_estimee` restent la valeur COURANTE (accès
    rapide, comportement inchangé, cf. `routers/portfolio.py`) ; cette table est
    l'historique complet, jamais purgée. S'applique à tout type valorisé
    manuellement (`TYPES_ACTIF_PATRIMOINE_MANUEL`), pas seulement l'immobilier —
    même mécanisme générique que `valeur_estimee` elle-même."""

    __tablename__ = "holding_valuation_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    holding_id: Mapped[int] = mapped_column(ForeignKey("holdings.id"), index=True)
    valeur: Mapped[float] = mapped_column(Float)
    date_valeur: Mapped[datetime] = mapped_column(DateTime)
    # Part de la hausse (ou de la baisse) depuis le point précédent qui vient d'un
    # versement (ou retrait, valeur négative) plutôt que d'une performance du contrat
    # — retour utilisateur 30/08/2026, backlog § U.2. `None` (par défaut, jamais
    # rétro-rempli sur l'historique existant) : le foyer n'a pas précisé, le reste
    # (`valeur − point précédent`) est alors traité comme un GAIN, purement estimé,
    # même logique que l'ancien calcul via `taux_pct` (cf. `rapport_service`).
    versement: Mapped[float | None] = mapped_column(Float, nullable=True)


class Etablissement(Base):
    """Établissement financier (banque, courtier...) — liste gérée par l'utilisateur
    (écran Comptes, backlog X.1), pas un texte libre : permet un regroupement
    fiable des comptes par établissement à l'écran (ex. « Caisse d'Épargne »
    contenant un compte courant ET une assurance-vie). Suppression : les `Compte`
    rattachés retombent à `etablissement_id = None` (jamais supprimés en cascade,
    cf. `services/comptes_service.delete_etablissement`)."""

    __tablename__ = "etablissements"
    __table_args__ = (UniqueConstraint("user_id", "nom", name="uq_etablissement_user_nom"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    nom: Mapped[str] = mapped_column(String)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)


class Compte(Base):
    """Compte structurel (compte courant, PEA, compte-titres, assurance-vie...) —
    écran Comptes (backlog X.1), remplace l'ancienne annotation texte libre
    `Holding.compte`. Cardinalité 1:N avec `Holding` (un compte-titres peut contenir
    plusieurs lignes) ; un actif valorisé manuellement (immobilier, épargne...) a en
    pratique sa propre ligne de compte (1:1), simple convention d'usage, rien
    n'impose cette cardinalité au niveau du schéma. `etablissement_id` nullable : un
    compte peut exister sans établissement rattaché (« Sans établissement » à
    l'écran). Suppression : les `Holding` rattachés retombent à `compte_id = None`
    (jamais supprimés en cascade, cf. `services/comptes_service.delete_compte`)."""

    __tablename__ = "comptes"
    __table_args__ = (UniqueConstraint("user_id", "nom", name="uq_compte_user_nom"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    nom: Mapped[str] = mapped_column(String)
    etablissement_id: Mapped[int | None] = mapped_column(ForeignKey("etablissements.id"), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)

    etablissement: Mapped["Etablissement | None"] = relationship("Etablissement", lazy="selectin")


# Types de détenteur — déclarés ici, avec les autres énumérations du modèle, plutôt
# que dans `schemas.py` : l'import de données (`donnees_service`) doit pouvoir les
# valider sans qu'un service ait à importer les schémas, ce qui inverserait le sens
# des dépendances du projet (c'est `schemas` qui importe les services, jamais
# l'inverse).
TYPES_DETENTEUR_VALIDES = {"personne", "societe"}


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


class Salaire(Base):
    """Une entrée de salaire du foyer pour une année donnée (backlog salaire/taux
    d'épargne) — PLUSIEURS entrées par année sont possibles (plusieurs revenus, ex.
    un par conjoint), chacune avec son propre taux d'imposition (pas de préférence
    globale partagée : deux personnes du foyer peuvent avoir des taux différents).
    `nom` distingue les entrées d'une même année à l'affichage (« Salaire de Paul »...).
    Le taux d'épargne du foyer (`services/salaire_service.compute_synthese_annee`) agrège
    toutes les entrées d'une année, jamais une seule prise isolément."""
    __tablename__ = "salaires"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    annee: Mapped[int] = mapped_column(Integer, index=True)
    nom: Mapped[str | None] = mapped_column(String, nullable=True)
    montant: Mapped[float] = mapped_column(Float)
    type_montant: Mapped[str] = mapped_column(String)  # "brut" | "net"
    periodicite: Mapped[str] = mapped_column(String)  # "mensuel" | "annuel"
    statut: Mapped[str] = mapped_column(String)  # "cadre" | "non_cadre"
    nombre_mois: Mapped[int] = mapped_column(Integer, default=12)
    # Taux d'imposition PROPRE à cette entrée (pas la préférence globale
    # `Preferences.taux_imposition_pct`, réservée à la déclaration de patrimoine, § 2.Q.2) :
    # `None` tant qu'il n'est pas renseigné pour cette entrée précise.
    taux_imposition_pct: Mapped[float | None] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)


class Transaction(Base):
    __tablename__ = "transactions"
    # Multi-utilisateur (Milestone 2a) : l'unicité de `transaction_id` (identifiant
    # émis par le courtier) devient relative à un utilisateur — deux utilisateurs
    # avec des comptes courtier différents peuvent avoir des `transaction_id` qui se
    # recoupent par coïncidence sans que ce soit un doublon. Remplace l'ancien
    # `unique=True` sur la seule colonne `transaction_id` (Milestone 2a, backlog 2.I.1).
    # Index composite (revue du 03/09/2026) : les rapports, la performance mensuelle
    # et les revenus passifs filtrent tous sur `user_id` + une plage de `date`.
    # L'index sur le seul `user_id` obligeait à parcourir toutes les transactions du
    # foyer pour n'en garder qu'une poignée — mesuré sur une base réelle : 4 059
    # lignes parcourues pour 97 utiles, 0,491 ms -> 0,009 ms une fois l'index posé
    # (il devient couvrant, SQLite ne touche plus la table).
    __table_args__ = (
        UniqueConstraint("transaction_id", "user_id", name="uq_transaction_user_transaction_id"),
        Index("ix_transactions_user_id_date", "user_id", "date"),
    )

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
# Rôles ASSIGNABLES à un compte du foyer. `ROLE_PROPRIETAIRE` en est volontairement
# exclu : il ne s'attribue pas, il naît du tout premier compte créé (cf. `register`).
# Remplace un `ROLES_VALIDES` qui listait les trois rôles sans que rien ne s'en
# serve — une constante d'apparence normative que personne n'appliquait, et qui
# aurait autorisé la création d'un second propriétaire si on s'y était fié
# (revue du 03/09/2026).
ROLES_ASSIGNABLES = (ROLE_MEMBRE, ROLE_INVITE)


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


class CategorieBudget(Base):
    """Arbre de catégories de dépenses/revenus (backlog 2.N.1), propre à chaque
    utilisateur (`user_id`) et entièrement modifiable — les catégories par défaut
    (`services/budget_categories_service.DEFAULT_CATEGORIES`) ne sont que le point de
    départ suggéré à la première utilisation, jamais recréées après coup. `parent_id`
    autorise UN niveau de sous-catégorie (ex. "Alimentation" > "Restaurants") ; les
    indicateurs de l'écran Budget (N.2) et les cibles (`BudgetCible`) portent sur les
    catégories racines pour rester lisibles — les sous-catégories affinent le tri des
    mouvements sans complexifier la comparaison cible/réel."""

    __tablename__ = "categories_budget"
    __table_args__ = (UniqueConstraint("user_id", "nom", "parent_id", name="uq_categorie_budget_user_nom_parent"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    nom: Mapped[str] = mapped_column(String)
    parent_id: Mapped[int | None] = mapped_column(ForeignKey("categories_budget.id"), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class MouvementBancaire(Base):
    """Un mouvement de compte bancaire importé (backlog 2.N.1) — conceptuellement
    l'équivalent de `Transaction` (grand livre du courtier) mais pour un relevé
    bancaire : format libre (CSV mappé à la main, OFX, QIF), montant signé (positif
    = entrée, négatif = sortie). `transaction_id` est l'identifiant du relevé source
    quand il en fournit un (OFX `FITID`) ; pour un CSV sans identifiant stable, un
    hash déterministe de (date, montant, libellé normalisé) en tient lieu — c'est
    exactement la clé de déduplication demandée par le backlog, portée directement
    par la contrainte d'unicité plutôt que recalculée à chaque import."""

    __tablename__ = "mouvements_bancaires"
    __table_args__ = (UniqueConstraint("user_id", "transaction_id", name="uq_mouvement_bancaire_user_txid"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    transaction_id: Mapped[str] = mapped_column(String, index=True)
    date: Mapped[str] = mapped_column(String, index=True)  # "YYYY-MM-DD"
    libelle: Mapped[str] = mapped_column(String)
    montant: Mapped[float] = mapped_column(Float)
    compte: Mapped[str | None] = mapped_column(String, nullable=True)
    categorie_id: Mapped[int | None] = mapped_column(ForeignKey("categories_budget.id"), nullable=True, index=True)
    # Distingue une catégorisation posée par une règle (`RegleCategorisation`, jamais
    # une garantie définitive) d'une correction manuelle de l'utilisateur — sans ce
    # drapeau, "réappliquer les règles en masse" écraserait silencieusement les
    # corrections déjà faites à la main.
    categorise_manuellement: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class RegleCategorisation(Base):
    """Règle de catégorisation automatique par mot-clé (backlog 2.N.1) : « le libellé
    contient `motif` (insensible à la casse/aux accents) → `categorie_id` ». Lisible
    et corrigeable, délibérément pas une IA — cf. le texte du backlog. Appliquée à
    l'import et réappliquable en masse (`budget_import_service.reappliquer_regles`)."""

    __tablename__ = "regles_categorisation"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    motif: Mapped[str] = mapped_column(String)
    categorie_id: Mapped[int] = mapped_column(ForeignKey("categories_budget.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class BudgetCible(Base):
    """Budget cible mensuel par catégorie racine (backlog 2.N.2) — comparé aux
    sorties réelles de la période pour afficher un écart. Une ligne par catégorie
    au plus (`UniqueConstraint`), montant toujours positif (dépense attendue)."""

    __tablename__ = "budget_cibles"
    __table_args__ = (UniqueConstraint("user_id", "categorie_id", name="uq_budget_cible_user_categorie"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    categorie_id: Mapped[int] = mapped_column(ForeignKey("categories_budget.id"))
    montant_mensuel: Mapped[float] = mapped_column(Float)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)


TYPE_OBJECTIF_FIRE = "fire"
TYPE_OBJECTIF_PRECAUTION = "precaution"
TYPE_OBJECTIF_IMMOBILIER = "immobilier"
TYPE_OBJECTIF_REMBOURSEMENT = "remboursement"
TYPE_OBJECTIF_PERSONNALISE = "personnalise"
TYPES_OBJECTIF = {
    TYPE_OBJECTIF_FIRE,
    TYPE_OBJECTIF_PRECAUTION,
    TYPE_OBJECTIF_IMMOBILIER,
    TYPE_OBJECTIF_REMBOURSEMENT,
    TYPE_OBJECTIF_PERSONNALISE,
}


class Objectif(Base):
    """Objectif suivi dans le temps (backlog 2.O.1) — distinct du simulateur
    (§ B.1/B.2), qui projette à la volée sans rien conserver. `valeur_a_la_creation`
    est un instantané figé au moment de la création (jamais recalculé) : ancre
    réelle du début de la « trajectoire réelle », en complément de la valeur
    actuelle recalculée à chaque lecture (`services/objectifs_service.py`)."""

    __tablename__ = "objectifs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    nom: Mapped[str] = mapped_column(String)
    type: Mapped[str] = mapped_column(String, default=TYPE_OBJECTIF_PERSONNALISE)
    montant_cible: Mapped[float] = mapped_column(Float)
    echeance: Mapped[str] = mapped_column(String)  # "YYYY-MM-DD"
    # Taux annuel hypothèse (%) utilisé pour la contribution mensuelle nécessaire —
    # 0 par défaut (le plus conservateur : aucun rendement supposé), librement
    # modifiable plutôt qu'ajouter un second champ de saisie séparé.
    rendement_hypothese_pct: Mapped[float] = mapped_column(Float, default=0.0)
    valeur_a_la_creation: Mapped[float] = mapped_column(Float)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class ObjectifActif(Base):
    """Actif(s) du portefeuille rattaché(s) à un objectif — leur valeur actuelle
    cumulée EST la progression réelle de l'objectif (backlog 2.O.1), pas de
    registre de versements séparé : réutilise la valorisation déjà en place plutôt
    que d'en construire une nouvelle. `holding_id` est une vraie FK (même choix que
    `QuotiteHolding`) : hérite de sa même limite connue, un rattachement sur un
    actif reconstruit depuis le grand livre (§ 3.1) ne survit pas à un ré-import
    qui recrée les lignes `origine=reconstruit` avec de nouveaux `id`."""

    __tablename__ = "objectif_actifs"
    __table_args__ = (UniqueConstraint("objectif_id", "holding_id", name="uq_objectif_actif"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    objectif_id: Mapped[int] = mapped_column(ForeignKey("objectifs.id"), index=True)
    holding_id: Mapped[int] = mapped_column(ForeignKey("holdings.id"), index=True)


class ObjectifContributeur(Base):
    """Détenteur(s) contributeur(s) d'un objectif (backlog 2.O.1) — purement
    informatif à ce stade (affiché sur la fiche de l'objectif), ne restreint aucun
    calcul de progression, qui reste toujours sur la valeur totale des actifs
    rattachés (pas de quotité par contributeur sur un objectif)."""

    __tablename__ = "objectif_contributeurs"
    __table_args__ = (UniqueConstraint("objectif_id", "detenteur_id", name="uq_objectif_contributeur"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    objectif_id: Mapped[int] = mapped_column(ForeignKey("objectifs.id"), index=True)
    detenteur_id: Mapped[int] = mapped_column(ForeignKey("detenteurs.id"), index=True)


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


class LienPartage(Base):
    """Lien de partage révocable en lecture seule (backlog 2.Q.1) — premier point
    d'accès PUBLIC de l'application, sans authentification. Surface volontairement
    restreinte à des sections agrégées (patrimoine net, exposition consolidée,
    rentabilité, budget, objectifs) : jamais le détail position par position, les
    transactions, ni les libellés de compte — même un lien deviné/fuité n'expose
    donc jamais autant qu'un compte `invite` authentifié. Gestion (création/liste/
    révocation) réservée à `ROLE_PROPRIETAIRE`, comme les autres réglages de
    sécurité (2.L.2) : un `membre` garde un accès large en lecture/écriture sur les
    données du foyer mais ne peut pas les exposer publiquement.

    `detenteur_id` (`None` = foyer entier) ne filtre que la section patrimoine net
    (seul calcul qui le supporte aujourd'hui, cf. `patrimoine_service.compute_patrimoine_net`)
    — budget/objectifs/exposition consolidée restent toujours vue foyer complète
    quand activés à côté d'un détenteur, limite assumée et signalée à la création
    du lien plutôt que silencieuse. `code_hash` (même format `pbkdf2_sha256$...`
    que `User.password_hash`, cf. `auth_service.hash_password`) : `None` si aucun
    code n'est exigé pour consulter ce lien."""

    __tablename__ = "liens_partage"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    token: Mapped[str] = mapped_column(String, unique=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    nom: Mapped[str] = mapped_column(String)
    detenteur_id: Mapped[int | None] = mapped_column(ForeignKey("detenteurs.id"), nullable=True)
    inclure_patrimoine_net: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1")
    inclure_repartition: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1")
    inclure_performance: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1")
    inclure_budget: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")
    inclure_objectifs: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")
    masquer_valeurs: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")
    code_hash: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    expires_at: Mapped[datetime] = mapped_column(DateTime)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class PartageAcces(Base):
    """Journal des consultations d'un lien de partage public (2.Q.1) — distinct
    d'`AccessLogEntry` (réservé aux connexions de comptes authentifiés) : alimente
    le verrouillage temporaire par lien (`services/partage_service.verrouillage_actif`),
    même mécanique que le verrouillage de connexion mais scopé par lien plutôt que
    par compte, puisqu'un lien public n'a pas d'identifiant utilisateur à verrouiller."""

    __tablename__ = "partage_acces"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    lien_id: Mapped[int] = mapped_column(ForeignKey("liens_partage.id"), index=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)
    ip: Mapped[str | None] = mapped_column(String, nullable=True)
    resultat: Mapped[str] = mapped_column(String)  # "succes" | "code_incorrect" | "verrouille"
