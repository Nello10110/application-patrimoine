"""Schémas Pydantic (requêtes/réponses de l'API). Organisés dans l'ordre d'apparition
des routeurs qui les utilisent : portefeuille, marché, objectifs, analyse, transactions,
rentabilité, historique, fiche détaillée.

Les contraintes de saisie (LOT 3.2) sont posées ici, sur les schémas, plutôt que par
des `if` dispersés dans les routeurs : c'est le seul endroit que FastAPI consulte
avant même d'atteindre le code métier, et les messages d'erreur (levés via
`ValueError` dans les validateurs) sont rendus au client en français par le
gestionnaire d'erreurs global de `main.py`, qui les fait remonter en `400` plutôt
que le `422` par défaut de FastAPI."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, field_validator, model_validator

MESSAGE_TICKER_VIDE = "Le ticker ne peut pas être vide"
MESSAGE_QUANTITE_POSITIVE = "La quantité doit être strictement positive (les positions vendues à découvert ne sont pas gérées)"
MESSAGE_PRIX_NON_NEGATIF = "Le prix de revient moyen ne peut pas être négatif"


def _normaliser_ticker(valeur: str) -> str:
    """Nettoyage centralisé d'un ticker saisi : espaces superflus retirés, majuscules
    imposées (un ticker/ISIN n'est jamais sensible à la casse dans cette appli).
    Remplace les deux `.strip().upper()` auparavant dupliqués dans `routers/portfolio.py`."""
    return valeur.strip().upper()


class HoldingBase(BaseModel):
    ticker: str
    nom: str | None = None
    quantite: float
    prix_revient_moyen: float | None = None
    compte: str | None = None
    devise: str | None = None
    type_actif: str | None = None

    @field_validator("ticker")
    @classmethod
    def _valider_ticker(cls, v: str) -> str:
        v = _normaliser_ticker(v)
        if not v:
            raise ValueError(MESSAGE_TICKER_VIDE)
        return v

    @field_validator("quantite")
    @classmethod
    def _valider_quantite(cls, v: float) -> float:
        if v <= 0:
            raise ValueError(MESSAGE_QUANTITE_POSITIVE)
        return v

    @field_validator("prix_revient_moyen")
    @classmethod
    def _valider_prix_revient(cls, v: float | None) -> float | None:
        if v is not None and v < 0:
            raise ValueError(MESSAGE_PRIX_NON_NEGATIF)
        return v


class HoldingCreate(HoldingBase):
    pass


class HoldingUpdate(BaseModel):
    ticker: str | None = None
    nom: str | None = None
    quantite: float | None = None
    prix_revient_moyen: float | None = None
    compte: str | None = None
    devise: str | None = None
    type_actif: str | None = None

    @field_validator("ticker")
    @classmethod
    def _valider_ticker(cls, v: str | None) -> str | None:
        if v is None:
            return v
        v = _normaliser_ticker(v)
        if not v:
            raise ValueError(MESSAGE_TICKER_VIDE)
        return v

    @field_validator("quantite")
    @classmethod
    def _valider_quantite(cls, v: float | None) -> float | None:
        if v is not None and v <= 0:
            raise ValueError(MESSAGE_QUANTITE_POSITIVE)
        return v

    @field_validator("prix_revient_moyen")
    @classmethod
    def _valider_prix_revient(cls, v: float | None) -> float | None:
        if v is not None and v < 0:
            raise ValueError(MESSAGE_PRIX_NON_NEGATIF)
        return v


class MarketDataOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    ticker: str
    nom: str | None = None
    prix_actuel: float | None = None
    devise: str | None = None
    secteur: str | None = None
    pays: str | None = None
    region: str | None = None
    erreur: str | None = None
    derniere_maj: datetime


class HoldingOut(HoldingBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    origine: str  # "manuel" | "reconstruit", cf. `models.ORIGINE_MANUEL`/`ORIGINE_RECONSTRUIT`
    created_at: datetime
    updated_at: datetime
    market_data: MarketDataOut | None = None
    rendement_depuis_achat_pct: float | None = None
    rendement_annualise_pct: float | None = None


class ImportPreviewResponse(BaseModel):
    file_token: str
    columns: list[str]
    rows: list[dict]
    total_rows: int


class ColumnMapping(BaseModel):
    file_token: str
    ticker_col: str
    quantite_col: str
    prix_revient_col: str | None = None
    nom_col: str | None = None
    compte_col: str | None = None
    devise_col: str | None = None
    replace_existing: bool = False

    @field_validator("ticker_col", "quantite_col")
    @classmethod
    def _valider_colonne_obligatoire(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("La colonne est obligatoire")
        return v


class ImportResult(BaseModel):
    imported: int
    skipped: int
    errors: list[str]


class AllocationTargetItem(BaseModel):
    categorie: str
    pourcentage_cible: float

    @field_validator("categorie")
    @classmethod
    def _valider_categorie(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("La catégorie ne peut pas être vide")
        return v

    @field_validator("pourcentage_cible")
    @classmethod
    def _valider_pourcentage(cls, v: float) -> float:
        if not (0 <= v <= 100):
            raise ValueError("Le pourcentage cible doit être compris entre 0 et 100")
        return v


class AllocationTargetsSet(BaseModel):
    annee: int
    geo: list[AllocationTargetItem]
    sector: list[AllocationTargetItem]

    @model_validator(mode="after")
    def _valider_categories_uniques(self) -> "AllocationTargetsSet":
        """Détecte un doublon de catégorie *avant* l'écriture en base (LOT 3.1) :
        sans ce contrôle, `routers/targets.set_targets` laisse SQLAlchemy lever une
        `IntegrityError` sur la contrainte `uq_target_annee_type_categorie`, renvoyée
        telle quelle en 500 par FastAPI."""
        for groupe, items in (("geo", self.geo), ("sector", self.sector)):
            vues: set[str] = set()
            for item in items:
                if item.categorie in vues:
                    raise ValueError(
                        f"Catégorie '{item.categorie}' en double dans la répartition '{groupe}' : "
                        "chaque catégorie ne peut apparaître qu'une seule fois par année"
                    )
                vues.add(item.categorie)
        return self


class AllocationTargetOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    annee: int
    type: str
    categorie: str
    pourcentage_cible: float


class AllocationBreakdownItem(BaseModel):
    categorie: str
    valeur: float
    pourcentage_reel: float
    pourcentage_cible: float | None = None
    ecart: float | None = None


class RiskIndicators(BaseModel):
    valeur_totale: float
    nombre_lignes: int
    top_ligne_poids: float
    top_ligne_nom: str | None = None
    top_pays_poids: float
    top_pays_nom: str | None = None
    top_secteur_poids: float
    top_secteur_nom: str | None = None
    score_diversification: float
    lignes_sans_donnees: int


class RebalancingAction(BaseModel):
    type: str  # "geo" | "sector"
    categorie: str
    ecart_pourcentage: float
    montant_a_ajuster: float
    sens: str  # "reduire" | "augmenter"


class QualiteDonnees(BaseModel):
    """Origine de la répartition géographique affichée (cf. LOT 2.1/2.3) : permet de
    signaler à l'écran quand le "réel" du tableau de bord est mesuré plutôt qu'estimé,
    voire pas du tout disponible."""

    valeur_composition_reelle: float
    pct_composition_reelle: float
    valeur_estimee_par_indice: float
    pct_estimee_par_indice: float
    valeur_non_categorisee: float
    pct_non_categorisee: float
    valeur_sans_cotation: float
    pct_sans_cotation: float


class AnalysisResponse(BaseModel):
    annee: int
    valeur_totale: float
    geo: list[AllocationBreakdownItem]
    sector: list[AllocationBreakdownItem]
    risques: RiskIndicators
    recommandations: list[RebalancingAction]
    qualite_donnees: QualiteDonnees


class TransactionImportResult(BaseModel):
    lignes_lues: int
    importees: int
    doublons_ignores: int
    mouvements_hors_bourse_exclus: int
    positions_recalculees: int
    anomalies_detectees: int = 0
    # Nombre de lignes saisies manuellement supprimées car le grand livre reconstruit
    # un ticker identique (LOT 3.4) : le grand livre fait foi, la ligne manuelle
    # ferait doublon dans tous les calculs.
    lignes_manuelles_remplacees: int = 0


class PerformanceSummary(BaseModel):
    valeur_positions: float
    valeur_totale: float
    cout_total_investi: float
    gain_perte_total: float
    rendement_simple_pct: float | None
    rendement_annualise_pct: float | None
    dividendes_percus: float
    interets_percus: float
    autres_revenus: float
    frais_payes: float
    impots_preleves: float
    gains_realises: float
    gains_latents: float
    nombre_transactions: int
    premiere_transaction: str | None = None


class RepartitionItem(BaseModel):
    categorie: str
    poids: float  # fraction 0-1


class CategoryCompositionItem(BaseModel):
    ticker: str
    nom: str | None = None
    valeur: float


class CategoryCompositionResponse(BaseModel):
    type: str
    categorie: str
    valeur_totale: float
    lignes: list[CategoryCompositionItem]


class PortfolioHistoryPoint(BaseModel):
    date: str
    valeur_portefeuille: float
    valeur_investie: float


class PortfolioHistoryResponse(BaseModel):
    points: list[PortfolioHistoryPoint]


class HoldingPricePoint(BaseModel):
    date: str
    prix: float


class HoldingPriceHistoryResponse(BaseModel):
    points: list[HoldingPricePoint]
    volatilite_annualisee_pct: float | None = None
    max_drawdown_pct: float | None = None


class FundTopHoldingItem(BaseModel):
    symbol: str
    nom: str | None = None
    poids: float  # fraction 0-1
    pays: str | None = None
    secteur: str | None = None


class HoldingDetail(BaseModel):
    ticker: str
    nom: str | None = None
    type_actif: str | None = None
    quantite: float
    prix_revient_moyen: float | None = None
    prix_actuel: float | None = None
    valeur: float
    devise: str | None = None
    secteur: str | None = None
    pays: str | None = None
    rendement_depuis_achat_pct: float | None = None
    rendement_annualise_pct: float | None = None
    emetteur: str | None = None
    resume: str | None = None
    frais_gestion_pct: float | None = None
    frais_transaction_payes: float = 0.0
    repartition_geo: list[RepartitionItem] = []
    repartition_sector: list[RepartitionItem] = []
    composition_actions: list[FundTopHoldingItem] = []


class EtatRafraichissement(BaseModel):
    """État du rafraîchissement des cours en tâche de fond (LOT 4B). Renvoyé par
    `POST /api/market-data/refresh` (202, état de démarrage) et
    `GET /api/market-data/refresh/status` (sondé par le frontend pendant que
    `en_cours` vaut `True`, notamment depuis la page Réglages — `POST
    /api/settings/jobs/{job_key}/run-now` déclenche le même exécuteur partagé,
    cf. `services/scheduler_service.run_job_now`)."""

    en_cours: bool
    positions_traitees: int
    positions_total: int
    demarre_le: datetime | None = None
    termine_le: datetime | None = None
    statut: str | None = None  # "ok" | "erreur" | None (jamais terminé, ou en cours)
    message: str | None = None


class ScheduledJobOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    job_key: str
    enabled: bool
    intervalle_heures: float
    derniere_execution: datetime | None = None
    dernier_statut: str | None = None
    dernier_message: str | None = None


class ScheduledJobUpdate(BaseModel):
    enabled: bool
    intervalle_heures: float

    @field_validator("intervalle_heures")
    @classmethod
    def _valider_intervalle(cls, v: float) -> float:
        if not (0.25 <= v <= 168):
            raise ValueError("L'intervalle doit être compris entre 0,25 heure (15 minutes) et 168 heures (une semaine)")
        return v
