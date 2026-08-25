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

from .models import ROLE_INVITE, ROLE_MEMBRE

from .services.preferences_service import METHODES_VALIDES
from .services.salaire_service import PERIODICITES_VALIDES, STATUTS_VALIDES, TYPES_MONTANT_VALIDES

MESSAGE_TICKER_VIDE = "Le ticker ne peut pas être vide"
MESSAGE_QUANTITE_POSITIVE = "La quantité doit être strictement positive (les positions vendues à découvert ne sont pas gérées)"
MESSAGE_PRIX_NON_NEGATIF = "Le prix de revient moyen ne peut pas être négatif"
MESSAGE_VALEUR_ESTIMEE_NON_NEGATIVE = "La valeur estimée ne peut pas être négative"


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
    # Valorisation manuelle (Phase 1 de `docs/ROADMAP.md`, immobilier/SCPI/assurance-vie/
    # PER — cf. `models.TYPES_ACTIF_PATRIMOINE_MANUEL`) : montant ABSOLU en euros, pas
    # un prix par part. `date_valeur_estimee` n'est jamais saisie par le client — posée
    # côté serveur au moment où `valeur_estimee` change (cf. `routers/portfolio.py`).
    valeur_estimee: float | None = None
    # Taux annuel informatif (backlog § 2.M.1) : positif = intérêt attendu (épargne),
    # négatif = décote attendue (véhicule) — cf. `models.Holding.taux_pct`.
    taux_pct: float | None = None
    # Zone géographique déclarée pour un actif valorisé manuellement (backlog 2.P.1) —
    # cf. `models.Holding.zone_geo`.
    zone_geo: str | None = None

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

    @field_validator("valeur_estimee")
    @classmethod
    def _valider_valeur_estimee(cls, v: float | None) -> float | None:
        if v is not None and v < 0:
            raise ValueError(MESSAGE_VALEUR_ESTIMEE_NON_NEGATIVE)
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
    valeur_estimee: float | None = None
    taux_pct: float | None = None
    zone_geo: str | None = None

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

    @field_validator("valeur_estimee")
    @classmethod
    def _valider_valeur_estimee(cls, v: float | None) -> float | None:
        if v is not None and v < 0:
            raise ValueError(MESSAGE_VALEUR_ESTIMEE_NON_NEGATIVE)
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
    # Valeur de la ligne (prix de marché, à défaut prix de revient, `None` si aucun des
    # deux n'est connu), calculée côté serveur avec `analysis_service.value_holdings`
    # pour éviter que le frontend ne recalcule le même chiffre (LOT 6.7).
    valeur: float | None = None
    date_valeur_estimee: datetime | None = None


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
    # Sous-ensemble de `recommandations` (LOT 5.5) dont l'écart absolu dépasse le
    # seuil `seuil_alerte_ecart_pct` (réglable, cf. `Preferences`) — pas un
    # recalcul : une recommandation informe d'un écart mesuré, une alerte réclame
    # une action de la part de l'utilisateur (cf. `routers/analysis.get_analysis`).
    alertes: list[RebalancingAction]
    qualite_donnees: QualiteDonnees


class RepartitionCompteItem(BaseModel):
    compte: str
    valeur: float
    pourcentage: float


class RepartitionComptesResponse(BaseModel):
    """Réponse de `GET /api/analysis/comptes` (LOT 5.1) : répartition de la VALEUR
    ACTUELLE du portefeuille par compte. Le compte est une annotation manuelle par
    ligne (`models.Holding.compte`) — le grand livre de transactions importé
    (format Trade Republic) ne porte aucune information de compte, il est donc
    impossible d'en déduire une rentabilité (XIRR, gains réalisés) par compte ;
    seule une répartition de la valeur actuelle est possible, cf. `pas_de_rentabilite_par_compte`."""

    valeur_totale: float
    items: list[RepartitionCompteItem]
    # `True` si au moins une ligne du portefeuille porte un compte renseigné —
    # sert au frontend à décider d'afficher ou non la carte dédiée du tableau de
    # bord (inutile tant qu'aucune ligne n'est annotée).
    a_des_comptes_annotes: bool
    pas_de_rentabilite_par_compte: str = (
        "Le compte est une annotation manuelle par ligne : le grand livre de transactions importé ne "
        "porte aucune information de compte, la rentabilité (XIRR, gains réalisés) par compte n'est "
        "donc pas calculable — seule la répartition de la valeur actuelle l'est."
    )


class CoutGestionConsolide(BaseModel):
    """Réponse de `GET /api/analysis/cout-gestion` (roadmap Phase 3, § E.3)."""

    valeur_fonds: float
    valeur_fonds_avec_ter_connu: float
    couverture_pct: float
    cout_annuel_estime: float


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
    # Cumul, à cette date, du produit des ventes + dividendes + intérêts + autres
    # revenus (cf. `historical_performance_service._serie_cumulee_ventes_et_revenus`) :
    # `valeur_portefeuille + valeur_realisee_cumulee - valeur_investie` reconstitue
    # exactement `gain_perte_total` de `GET /api/performance` — sans ce champ, ces
    # montants restaient absents du graphique du tableau de bord.
    valeur_realisee_cumulee: float


class PortfolioHistoryResponse(BaseModel):
    points: list[PortfolioHistoryPoint]


class MetriquesAvancees(BaseModel):
    """Backlog 2.P.2 — `services/metriques_performance_service.compute_metriques_avancees`."""

    twr_cumule_pct: float | None
    twr_annualise_pct: float | None
    volatilite_annualisee_pct: float | None
    max_drawdown_pct: float | None
    drawdown_recupere: bool | None
    semaines_recuperation: int | None


class ComparaisonBenchmarkPoint(BaseModel):
    date: str
    portefeuille_pct: float | None
    benchmark_pct: float | None


class ComparaisonBenchmark(BaseModel):
    benchmark_key: str
    label: str
    points: list[ComparaisonBenchmarkPoint]


class BenchmarkOption(BaseModel):
    key: str
    label: str


class RevenusPassifsProjetes(BaseModel):
    """Backlog 2.P.3 (absorbe C.2) — `services/revenus_passifs_service.compute_revenus_passifs`."""

    loyers_nets_annuels: float
    interets_livrets_annuels: float
    revenu_certain_annuel: float
    dividendes_estimes_annuels: float
    interets_courtage_estimes_annuels: float
    revenu_estime_annuel: float
    revenu_total_projete_annuel: float
    revenu_total_projete_mensuel: float


class DividendeLigne(BaseModel):
    date: str
    symbol: str | None
    nom: str | None
    montant: float


class DividendeMois(BaseModel):
    mois: str  # "AAAA-MM"
    montant_total: float
    lignes: list[DividendeLigne]


class MouvementRapport(BaseModel):
    date: str
    type: str
    symbol: str | None
    nom: str | None
    montant: float


class RapportPeriode(BaseModel):
    """Réponse de `GET /api/performance/rapport` (roadmap Phase 4, § D.2 — étendu à
    l'annuel et aux périodes personnalisées) : `date_debut`/`date_fin` sont les
    bornes réellement utilisées (celles envoyées par l'appelant), en écho pour que
    l'écran puisse afficher la période exacte sans la recalculer lui-même."""

    date_debut: str
    date_fin: str
    valeur_debut_periode: float | None
    valeur_fin_periode: float | None
    evolution_pct: float | None
    # Décomposition de l'évolution (backlog, demande directe 25/08/2026) : argent
    # AJOUTÉ (achats réels sur la période) vs GÉNÉRÉ (plus-value + dividendes +
    # intérêts, jamais confondus). `None` seulement si aucun historique de
    # portefeuille n'existe encore sur la période (même condition qu'`evolution_pct`).
    montant_investi_periode: float
    gain_genere_periode: float | None
    dividendes_percus: float
    nombre_transactions: int
    plus_gros_mouvements: list[MouvementRapport]


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


class HoldingImmobilierOut(BaseModel):
    type_location: str | None = None
    loyer_mensuel: float | None = None
    charges_mensuelles: float | None = None
    frais_annuels: float | None = None
    surface_m2: float | None = None
    nb_pieces: int | None = None
    annee_construction: int | None = None
    dpe: str | None = None
    # Calculés côté serveur (`holding_detail_service`), jamais recalculés côté
    # frontend — même discipline que `HoldingOut.valeur` (LOT 6.7). `None` tant que
    # `loyer_mensuel` n'est pas renseigné (rien à projeter).
    cashflow_mensuel: float | None = None
    rentabilite_brute_pct: float | None = None
    rentabilite_nette_pct: float | None = None
    prix_m2: float | None = None
    emprunt_mensualite: float | None = None


MESSAGE_LOYER_NON_NEGATIF = "Le loyer mensuel ne peut pas être négatif"
MESSAGE_CHARGES_NON_NEGATIVES = "Les charges mensuelles ne peuvent pas être négatives"
MESSAGE_FRAIS_NON_NEGATIFS = "Les frais annuels ne peuvent pas être négatifs"
MESSAGE_SURFACE_POSITIVE = "La surface doit être strictement positive"
MESSAGE_PIECES_POSITIVES = "Le nombre de pièces doit être strictement positif"


class HoldingImmobilierUpdate(BaseModel):
    type_location: str | None = None
    loyer_mensuel: float | None = None
    charges_mensuelles: float | None = None
    frais_annuels: float | None = None
    surface_m2: float | None = None
    nb_pieces: int | None = None
    annee_construction: int | None = None
    dpe: str | None = None

    @field_validator("loyer_mensuel")
    @classmethod
    def _valider_loyer(cls, v: float | None) -> float | None:
        if v is not None and v < 0:
            raise ValueError(MESSAGE_LOYER_NON_NEGATIF)
        return v

    @field_validator("charges_mensuelles")
    @classmethod
    def _valider_charges(cls, v: float | None) -> float | None:
        if v is not None and v < 0:
            raise ValueError(MESSAGE_CHARGES_NON_NEGATIVES)
        return v

    @field_validator("frais_annuels")
    @classmethod
    def _valider_frais(cls, v: float | None) -> float | None:
        if v is not None and v < 0:
            raise ValueError(MESSAGE_FRAIS_NON_NEGATIFS)
        return v

    @field_validator("surface_m2")
    @classmethod
    def _valider_surface(cls, v: float | None) -> float | None:
        if v is not None and v <= 0:
            raise ValueError(MESSAGE_SURFACE_POSITIVE)
        return v

    @field_validator("nb_pieces")
    @classmethod
    def _valider_pieces(cls, v: int | None) -> int | None:
        if v is not None and v <= 0:
            raise ValueError(MESSAGE_PIECES_POSITIVES)
        return v


class ValuationHistoryPoint(BaseModel):
    date_valeur: datetime
    valeur: float


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
    # Détail brut justETF (2.4, Increment 9), affichage seul — cf. `FundCompositionBrute`.
    repartition_geo_detaillee: list[RepartitionItem] = []
    repartition_sector_detaillee: list[RepartitionItem] = []
    composition_actions: list[FundTopHoldingItem] = []
    # Détenteurs (backlog 2.L.1) : quotités de l'actif + part détenue/nette calculée
    # par détenteur. Listes vides si l'utilisateur n'a déclaré aucun détenteur, ou si
    # cette ligne n'a jamais été répartie (100 % foyer implicite).
    quotites: list["QuotiteDetenteurItem"] = []
    # Fiche immobilier complète (backlog § 2.M.3) : `None` pour toute ligne qui n'a
    # jamais reçu de détail immobilier (pas seulement les non-`REAL_ESTATE` — rien
    # n'empêche techniquement d'en saisir un ailleurs, mais l'UI ne le propose que
    # pour ce type).
    immobilier: HoldingImmobilierOut | None = None


TYPES_DETENTEUR_VALIDES = {"personne", "societe"}


class DetenteurBase(BaseModel):
    nom: str
    type: str  # "personne" | "societe"

    @field_validator("nom")
    @classmethod
    def _valider_nom(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Le nom ne peut pas être vide")
        return v

    @field_validator("type")
    @classmethod
    def _valider_type(cls, v: str) -> str:
        if v not in TYPES_DETENTEUR_VALIDES:
            raise ValueError(f"Type de détenteur invalide : doit être l'un de {TYPES_DETENTEUR_VALIDES}")
        return v


class DetenteurCreate(DetenteurBase):
    pass


class DetenteurUpdate(BaseModel):
    nom: str | None = None
    type: str | None = None

    @field_validator("nom")
    @classmethod
    def _valider_nom(cls, v: str | None) -> str | None:
        if v is None:
            return v
        v = v.strip()
        if not v:
            raise ValueError("Le nom ne peut pas être vide")
        return v

    @field_validator("type")
    @classmethod
    def _valider_type(cls, v: str | None) -> str | None:
        if v is not None and v not in TYPES_DETENTEUR_VALIDES:
            raise ValueError(f"Type de détenteur invalide : doit être l'un de {TYPES_DETENTEUR_VALIDES}")
        return v


class DetenteurOut(DetenteurBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
    updated_at: datetime


class QuotiteDetenteurItem(BaseModel):
    """Une ligne de la répartition d'un actif (backlog 2.L.1) : la quotité saisie,
    plus la part détenue/nette qui en découle — calculées côté serveur, jamais côté
    frontend (même discipline que `HoldingOut.valeur`/`LoanOut.capital_restant_du`)."""

    detenteur_id: int
    detenteur_nom: str
    quotite_pct: float
    part_detenue: float
    part_nette: float


class QuotiteEntree(BaseModel):
    """Une ligne envoyée par le client pour (re)définir la répartition d'un actif ou
    d'un emprunt — `PUT .../quotites`, remplacement intégral de l'ensemble existant."""

    detenteur_id: int
    quotite_pct: float

    @field_validator("quotite_pct")
    @classmethod
    def _valider_quotite(cls, v: float) -> float:
        if not (0 < v <= 100):
            raise ValueError("La quotité doit être strictement comprise entre 0 et 100")
        return v


class QuotitesUpdate(BaseModel):
    quotites: list[QuotiteEntree]


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


class Preferences(BaseModel):
    """Réglages applicatifs persistants (LOT 5B), cf. `services/preferences_service.py`."""

    methode_cout: str  # "cout_moyen_pondere" | "fifo"
    seuil_alerte_ecart_pct: float
    # Taux d'imposition SAISI (backlog 2.Q.2) : une donnée reprise telle quelle dans
    # la déclaration de patrimoine, jamais un calcul fiscal — cf. `docs/BACKLOG.md` § 3.
    taux_imposition_pct: float | None = None


class PreferencesUpdate(BaseModel):
    methode_cout: str
    seuil_alerte_ecart_pct: float
    taux_imposition_pct: float | None = None

    @field_validator("methode_cout")
    @classmethod
    def _valider_methode(cls, v: str) -> str:
        if v not in METHODES_VALIDES:
            raise ValueError(f"Méthode de calcul du coût de revient invalide : doit être l'une de {METHODES_VALIDES}")
        return v

    @field_validator("seuil_alerte_ecart_pct")
    @classmethod
    def _valider_seuil(cls, v: float) -> float:
        if not (0 <= v <= 100):
            raise ValueError("Le seuil d'alerte doit être compris entre 0 et 100")
        return v

    @field_validator("taux_imposition_pct")
    @classmethod
    def _valider_taux_imposition(cls, v: float | None) -> float | None:
        if v is not None and not (0 <= v <= 100):
            raise ValueError("Le taux d'imposition doit être compris entre 0 et 100")
        return v


class PreferencesUpdateResponse(Preferences):
    """Réponse de `PUT /api/settings/preferences` : les préférences enregistrées,
    plus le nombre de positions recalculées si le changement a déclenché une
    reconstruction du portefeuille (LOT 5.6 — uniquement quand `methode_cout`
    change réellement, `None` sinon)."""

    positions_recalculees: int | None = None


class SalaireIn(BaseModel):
    """Saisie d'UNE entrée de salaire (plusieurs entrées possibles par année, ex. un
    revenu par conjoint — chacune avec son propre taux d'imposition), cf.
    `services/salaire_service.py`."""

    annee: int
    nom: str | None = None
    montant: float
    type_montant: str  # "brut" | "net"
    periodicite: str  # "mensuel" | "annuel"
    statut: str  # "cadre" | "non_cadre"
    nombre_mois: int = 12
    taux_imposition_pct: float | None = None

    @field_validator("annee")
    @classmethod
    def _valider_annee(cls, v: int) -> int:
        if not (2000 <= v <= 2100):
            raise ValueError("L'année doit être comprise entre 2000 et 2100")
        return v

    @field_validator("nom")
    @classmethod
    def _valider_nom(cls, v: str | None) -> str | None:
        if v is None:
            return None
        return v.strip() or None

    @field_validator("montant")
    @classmethod
    def _valider_montant(cls, v: float) -> float:
        if v <= 0:
            raise ValueError("Le montant doit être strictement positif")
        return v

    @field_validator("type_montant")
    @classmethod
    def _valider_type_montant(cls, v: str) -> str:
        if v not in TYPES_MONTANT_VALIDES:
            raise ValueError(f"Type de montant invalide : doit être l'un de {TYPES_MONTANT_VALIDES}")
        return v

    @field_validator("periodicite")
    @classmethod
    def _valider_periodicite(cls, v: str) -> str:
        if v not in PERIODICITES_VALIDES:
            raise ValueError(f"Périodicité invalide : doit être l'une de {PERIODICITES_VALIDES}")
        return v

    @field_validator("statut")
    @classmethod
    def _valider_statut(cls, v: str) -> str:
        if v not in STATUTS_VALIDES:
            raise ValueError(f"Statut invalide : doit être l'un de {STATUTS_VALIDES}")
        return v

    @field_validator("nombre_mois")
    @classmethod
    def _valider_nombre_mois(cls, v: int) -> int:
        if not (1 <= v <= 24):
            raise ValueError("Le nombre de versements par an doit être compris entre 1 et 24")
        return v

    @field_validator("taux_imposition_pct")
    @classmethod
    def _valider_taux_imposition(cls, v: float | None) -> float | None:
        if v is not None and not (0 <= v <= 100):
            raise ValueError("Le taux d'imposition doit être compris entre 0 et 100")
        return v


class SalaireResume(BaseModel):
    """Résultat calculé du calculateur brut/net pour UNE entrée de salaire, cf.
    `services/salaire_service.resume_depuis_ligne`."""

    id: int
    annee: int
    nom: str
    montant: float
    type_montant: str
    periodicite: str
    statut: str
    nombre_mois: int
    taux_imposition_pct: float | None
    brut_annuel: float
    brut_mensuel_moyen: float
    brut_par_versement: float
    net_avant_impot_annuel: float
    net_avant_impot_mensuel_moyen: float
    net_avant_impot_par_versement: float
    net_apres_impot_annuel: float | None
    net_apres_impot_mensuel_moyen: float | None


class SyntheseAnnee(BaseModel):
    """Agrégat de TOUTES les entrées de salaire d'une année — taux d'épargne du foyer,
    cf. `services/salaire_service.compute_synthese_annee`."""

    annee: int
    nombre_salaires: int
    net_total_annuel: float
    toutes_les_entrees_ont_un_taux_imposition: bool
    montant_investi_annee: float
    taux_epargne_pct: float | None


class SalaireDonnees(BaseModel):
    """Réponse complète de `GET /api/salaire/` : toutes les entrées (pour l'édition) et
    la synthèse de chaque année où au moins une entrée existe (pour l'historique)."""

    entrees: list[SalaireResume]
    syntheses: list[SyntheseAnnee]


class LoanBase(BaseModel):
    """Emprunt (Phase 1 de `docs/ROADMAP.md`, patrimoine net) — cf. `models.Loan`."""

    libelle: str
    capital_initial: float
    taux_annuel_pct: float
    mensualite: float
    date_debut: datetime
    duree_mois: int
    capital_restant_du_manuel: float | None = None

    @field_validator("libelle")
    @classmethod
    def _valider_libelle(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Le libellé de l'emprunt ne peut pas être vide")
        return v

    @field_validator("capital_initial")
    @classmethod
    def _valider_capital_initial(cls, v: float) -> float:
        if v <= 0:
            raise ValueError("Le capital initial doit être strictement positif")
        return v

    @field_validator("taux_annuel_pct")
    @classmethod
    def _valider_taux(cls, v: float) -> float:
        if v < 0:
            raise ValueError("Le taux annuel ne peut pas être négatif")
        return v

    @field_validator("mensualite")
    @classmethod
    def _valider_mensualite(cls, v: float) -> float:
        if v <= 0:
            raise ValueError("La mensualité doit être strictement positive")
        return v

    @field_validator("duree_mois")
    @classmethod
    def _valider_duree(cls, v: int) -> int:
        if v <= 0:
            raise ValueError("La durée doit être strictement positive (en mois)")
        return v

    @field_validator("capital_restant_du_manuel")
    @classmethod
    def _valider_capital_restant_du_manuel(cls, v: float | None) -> float | None:
        if v is not None and v < 0:
            raise ValueError("Le capital restant dû ne peut pas être négatif")
        return v


class LoanCreate(LoanBase):
    pass


class LoanUpdate(BaseModel):
    libelle: str | None = None
    capital_initial: float | None = None
    taux_annuel_pct: float | None = None
    mensualite: float | None = None
    date_debut: datetime | None = None
    duree_mois: int | None = None
    capital_restant_du_manuel: float | None = None
    # Rattachement à un actif (backlog 2.M.2) — champ à part (pas dans `LoanBase`, non
    # demandé à la création) : `None` explicite dans le corps de la requête signifie
    # "dérattacher", absence du champ signifie "ne pas toucher" (cf. `routers/loans.py`,
    # exclude_unset=True).
    holding_id: int | None = None

    @field_validator("libelle")
    @classmethod
    def _valider_libelle(cls, v: str | None) -> str | None:
        if v is None:
            return v
        v = v.strip()
        if not v:
            raise ValueError("Le libellé de l'emprunt ne peut pas être vide")
        return v

    @field_validator("capital_initial")
    @classmethod
    def _valider_capital_initial(cls, v: float | None) -> float | None:
        if v is not None and v <= 0:
            raise ValueError("Le capital initial doit être strictement positif")
        return v

    @field_validator("taux_annuel_pct")
    @classmethod
    def _valider_taux(cls, v: float | None) -> float | None:
        if v is not None and v < 0:
            raise ValueError("Le taux annuel ne peut pas être négatif")
        return v

    @field_validator("mensualite")
    @classmethod
    def _valider_mensualite(cls, v: float | None) -> float | None:
        if v is not None and v <= 0:
            raise ValueError("La mensualité doit être strictement positive")
        return v

    @field_validator("duree_mois")
    @classmethod
    def _valider_duree(cls, v: int | None) -> int | None:
        if v is not None and v <= 0:
            raise ValueError("La durée doit être strictement positive (en mois)")
        return v

    @field_validator("capital_restant_du_manuel")
    @classmethod
    def _valider_capital_restant_du_manuel(cls, v: float | None) -> float | None:
        if v is not None and v < 0:
            raise ValueError("Le capital restant dû ne peut pas être négatif")
        return v


class LoanOut(LoanBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    derniere_maj_manuelle: datetime | None = None
    created_at: datetime
    updated_at: datetime
    # Calculé côté serveur (`loan_service.compute_capital_restant_du`) — jamais recalculé
    # côté frontend, même raison que `HoldingOut.valeur` (LOT 6.7) : une seule source de
    # vérité pour un chiffre qui compte (c'est un passif du patrimoine net). Pas une
    # colonne de `models.Loan` : la valeur par défaut ci-dessous n'existe que pour que
    # `model_validate(loan)` réussisse (`from_attributes=True` exige l'attribut) avant
    # d'être systématiquement écrasée par `routers/loans._vers_loan_out`.
    capital_restant_du: float = 0.0
    holding_id: int | None = None


class RepartitionParClasseItem(BaseModel):
    categorie: str
    valeur: float


class PatrimoineNetResponse(BaseModel):
    """Patrimoine net global (Phase 1 de `docs/ROADMAP.md`) — `services/patrimoine_service.py`.
    Distinct de `AnalysisResponse.valeur_totale` (scopé au seul portefeuille financier,
    cf. `analysis_service.holdings_financiers`) : `actifs_totaux` ici couvre en plus
    l'immobilier/SCPI/assurance-vie/PER, et `patrimoine_net` en retranche les emprunts.

    `patrimoine_net` sert aussi de capital de départ par défaut à l'écran Simulateur
    (fusion Simulateur/Outils) : depuis cet increment, la projection, le tableau de
    détail et le calcul FIRE sont calculés côté client
    (`frontend/src/utils/interetsComposes.ts`), il n'existe donc plus d'endpoint
    `/api/patrimoine/simulation`/`/fire` dédié — ce module reste la seule source de
    vérité pour le patrimoine net lui-même."""

    actifs_totaux: float
    passifs_totaux: float
    patrimoine_net: float
    # Lentille "financier" (backlog 2.K.3) : valeur du seul portefeuille financier
    # (actions/ETF/crypto/obligations/private equity — cf. `analysis_service.holdings_financiers`),
    # sans retrancher les emprunts (aucun rattachement emprunt↔actif n'existe encore, cf. M.2).
    patrimoine_financier: float
    repartition_par_classe: list[RepartitionParClasseItem]


class ZoneGeographiqueInfo(BaseModel):
    """Écran d'aide (FAQ) : une zone géographique et les pays qu'elle contient
    (`services/reference_indices.zones_geographiques`)."""

    zone: str
    pays: list[str]


MESSAGE_MOT_DE_PASSE_TROP_COURT = "Le mot de passe doit contenir au moins 8 caractères"
MESSAGE_NOM_UTILISATEUR_INVALIDE = "Le nom d'utilisateur doit contenir entre 2 et 32 caractères"


class RegisterRequest(BaseModel):
    username: str
    password: str

    @field_validator("username")
    @classmethod
    def _valider_username(cls, v: str) -> str:
        v = v.strip()
        if not (2 <= len(v) <= 32):
            raise ValueError(MESSAGE_NOM_UTILISATEUR_INVALIDE)
        return v

    @field_validator("password")
    @classmethod
    def _valider_password(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError(MESSAGE_MOT_DE_PASSE_TROP_COURT)
        return v


class LoginRequest(BaseModel):
    username: str
    password: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    role: str
    # Métadonnées d'affichage pures (backlog SSO, claim mapping) — `None` pour un
    # compte mot de passe local, jamais utilisées pour l'authentification.
    email: str | None = None
    nom: str | None = None


class AuthResponse(BaseModel):
    token: str
    user: UserOut


class OidcStatus(BaseModel):
    enabled: bool
    # Texte choisi par le propriétaire pour le bouton de connexion (Réglages) — jamais
    # un nom de fournisseur figé dans le code, cf. `oidc_service.DISPLAY_NAME_PAR_DEFAUT`.
    display_name: str = "SSO"


MESSAGE_CHAMP_OIDC_VIDE = "Ce champ ne peut pas être vide."


class OidcConfigOut(BaseModel):
    issuer: str | None
    client_id: str | None
    redirect_uri: str | None
    frontend_url: str | None
    secret_configure: bool
    cle_chiffrement_definie: bool
    enabled: bool
    display_name: str
    claim_username: str
    claim_email: str
    claim_nom: str


class OidcConfigUpdate(BaseModel):
    issuer: str
    client_id: str
    redirect_uri: str
    frontend_url: str
    client_secret: str | None = None
    enabled: bool = True
    display_name: str | None = None
    claim_username: str | None = None
    claim_email: str | None = None
    claim_nom: str | None = None

    @field_validator("issuer", "client_id", "redirect_uri", "frontend_url")
    @classmethod
    def _valider_non_vide(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError(MESSAGE_CHAMP_OIDC_VIDE)
        return v


class SessionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id_session: str
    created_at: datetime
    expires_at: datetime
    derniere_utilisation: datetime
    ip: str | None
    user_agent: str | None
    est_courante: bool = False


class AccessLogEntryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    timestamp: datetime
    username_saisi: str
    ip: str | None
    action: str
    resultat: str
    raison: str | None


class HouseholdMemberCreate(BaseModel):
    username: str
    password: str
    role: str
    # Détenteurs auxquels un compte "invite" a accès en lecture (2.L.2) — ignoré
    # pour un compte "membre" (accès de type par ressource, pas par détenteur).
    detenteur_ids: list[int] = []

    @field_validator("username")
    @classmethod
    def _valider_username(cls, v: str) -> str:
        v = v.strip()
        if not (2 <= len(v) <= 32):
            raise ValueError(MESSAGE_NOM_UTILISATEUR_INVALIDE)
        return v

    @field_validator("password")
    @classmethod
    def _valider_password(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError(MESSAGE_MOT_DE_PASSE_TROP_COURT)
        return v

    @field_validator("role")
    @classmethod
    def _valider_role(cls, v: str) -> str:
        if v not in (ROLE_MEMBRE, ROLE_INVITE):
            raise ValueError("Le rôle doit être 'membre' ou 'invite'")
        return v


class HouseholdMemberOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    role: str
    created_at: datetime
    detenteur_ids: list[int] = []
    email: str | None = None
    nom: str | None = None


# ---------------------------------------------------------------------------
# Budget (backlog 2.N.1/2.N.2)
# ---------------------------------------------------------------------------


class CategorieBudgetOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    nom: str
    parent_id: int | None = None


class CategorieBudgetCreate(BaseModel):
    nom: str
    parent_id: int | None = None

    @field_validator("nom")
    @classmethod
    def _valider_nom(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Le nom de la catégorie ne peut pas être vide")
        return v


class CategorieBudgetUpdate(BaseModel):
    nom: str

    @field_validator("nom")
    @classmethod
    def _valider_nom(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Le nom de la catégorie ne peut pas être vide")
        return v


class RegleCategorisationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    motif: str
    categorie_id: int


class RegleCategorisationCreate(BaseModel):
    motif: str
    categorie_id: int

    @field_validator("motif")
    @classmethod
    def _valider_motif(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Le motif ne peut pas être vide")
        return v


class RegleReapplicationResult(BaseModel):
    mouvements_modifies: int


class MouvementBancaireOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    date: str
    libelle: str
    montant: float
    compte: str | None = None
    categorie_id: int | None = None
    categorise_manuellement: bool


class MouvementCategorisationUpdate(BaseModel):
    categorie_id: int | None = None


class BudgetColumnMapping(BaseModel):
    file_token: str
    date_col: str
    libelle_col: str
    montant_col: str | None = None
    debit_col: str | None = None
    credit_col: str | None = None
    compte: str | None = None

    @field_validator("date_col", "libelle_col")
    @classmethod
    def _valider_colonne_obligatoire(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("La colonne est obligatoire")
        return v

    @model_validator(mode="after")
    def _valider_montant_ou_debit_credit(self) -> "BudgetColumnMapping":
        if not self.montant_col and not (self.debit_col or self.credit_col):
            raise ValueError("Indique une colonne montant, ou au moins une colonne débit/crédit")
        return self


class BudgetImportResult(BaseModel):
    lignes_lues: int
    importees: int
    doublons_ignores: int
    lignes_ignorees: int
    categorisees_automatiquement: int


class BudgetCibleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    categorie_id: int
    montant_mensuel: float


class BudgetCibleUpdate(BaseModel):
    montant_mensuel: float

    @field_validator("montant_mensuel")
    @classmethod
    def _valider_montant_positif(cls, v: float) -> float:
        if v < 0:
            raise ValueError("Le budget cible ne peut pas être négatif")
        return v


class RepartitionSortieItem(BaseModel):
    categorie_id: int | None
    categorie_nom: str
    montant: float
    cible_mensuelle: float | None = None


class BudgetSummary(BaseModel):
    entrees: float
    sorties: float
    disponible: float
    depenses_recurrentes_mensuelles: float
    repartition_sorties: list[RepartitionSortieItem]


class RecurrenceDetecteeOut(BaseModel):
    libelle: str
    categorie_id: int | None
    montant_actuel: float
    montant_precedent: float | None
    hausse_prix: bool
    occurrences: int
    premiere_date: str
    derniere_date: str
    periodicite: str


class JonctionPatrimoine(BaseModel):
    taux_epargne_reel_pct: float | None
    reste_a_vivre: float | None
    versement_mensuel_suggere: float | None
    categorie_epargne_introuvable: bool
    categorie_logement_introuvable: bool


# ---------------------------------------------------------------------------
# Objectifs suivis et indicateurs de situation (backlog 2.O.1/2.O.2)
# ---------------------------------------------------------------------------


class ObjectifCreate(BaseModel):
    nom: str
    type: str = "personnalise"
    montant_cible: float
    echeance: str
    rendement_hypothese_pct: float = 0.0
    holding_ids: list[int] = []
    detenteur_ids: list[int] = []

    @field_validator("nom")
    @classmethod
    def _valider_nom(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Le nom de l'objectif ne peut pas être vide")
        return v

    @field_validator("montant_cible")
    @classmethod
    def _valider_montant(cls, v: float) -> float:
        if v <= 0:
            raise ValueError("Le montant cible doit être strictement positif")
        return v


class ActifRattacheOut(BaseModel):
    holding_id: int
    ticker: str
    nom: str | None = None


class ContributeurObjectifOut(BaseModel):
    id: int
    nom: str


class TrajectoirePoint(BaseModel):
    date: str
    valeur: float


class ObjectifDetail(BaseModel):
    id: int
    nom: str
    type: str
    montant_cible: float
    echeance: str
    rendement_hypothese_pct: float
    created_at: datetime
    valeur_a_la_creation: float
    valeur_actuelle: float
    progression_pct: float | None
    diagnostic: str
    retard_mois: int | None
    rendement_requis_pct: float | None
    contribution_mensuelle_necessaire: float | None
    trajectoire_cible: list[TrajectoirePoint]
    trajectoire_reelle: list[TrajectoirePoint]
    actifs_rattaches: list[ActifRattacheOut]
    contributeurs: list[ContributeurObjectifOut]


class ExpositionConsolidee(BaseModel):
    """Backlog 2.P.1 — `services/patrimoine_service.compute_exposition_consolidee`."""

    valeur_totale: float
    repartition_geo: list[RepartitionParClasseItem]
    repartition_classe: list[RepartitionParClasseItem]
    plus_grosse_ligne_ticker: str | None
    plus_grosse_ligne_pct: float | None
    top5_lignes_pct: float | None
    premiere_zone_geo: str | None
    premiere_zone_geo_pct: float | None
    part_estimee_manuelle_pct: float


# ---------------------------------------------------------------------------
# Lien de partage révocable (backlog 2.Q.1)
# ---------------------------------------------------------------------------


class LienPartageCreate(BaseModel):
    nom: str
    detenteur_id: int | None = None
    duree_jours: int = 30
    inclure_patrimoine_net: bool = True
    inclure_repartition: bool = True
    inclure_performance: bool = True
    inclure_budget: bool = False
    inclure_objectifs: bool = False
    masquer_valeurs: bool = False
    code: str | None = None

    @field_validator("nom")
    @classmethod
    def _valider_nom(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Le nom du lien ne peut pas être vide")
        return v

    @field_validator("duree_jours")
    @classmethod
    def _valider_duree(cls, v: int) -> int:
        if v <= 0 or v > 365:
            raise ValueError("La durée doit être comprise entre 1 et 365 jours")
        return v

    @field_validator("code")
    @classmethod
    def _valider_code(cls, v: str | None) -> str | None:
        if v is not None and len(v.strip()) < 4:
            raise ValueError("Le code doit contenir au moins 4 caractères")
        return v.strip() if v else None


class LienPartageOut(BaseModel):
    """Contrairement à `AuthToken` (jeton de session, jamais réaffiché après sa
    création — cf. `SessionOut`), `token` reste exposé à chaque relecture : un lien
    de partage est fait pour être recopié/renvoyé plus tard par le propriétaire, pas
    consulté une seule fois à sa création. Différence assumée, pas un oubli."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    token: str
    nom: str
    detenteur_id: int | None
    inclure_patrimoine_net: bool
    inclure_repartition: bool
    inclure_performance: bool
    inclure_budget: bool
    inclure_objectifs: bool
    masquer_valeurs: bool
    code_requis: bool
    created_at: datetime
    expires_at: datetime
    revoked_at: datetime | None


class PartageAccesRequest(BaseModel):
    code: str | None = None


class PartageRepartitionItem(BaseModel):
    categorie: str
    valeur: float | None
    pourcentage: float


class PartagePatrimoineNet(BaseModel):
    patrimoine_net: float | None
    actifs_totaux: float | None
    passifs_totaux: float | None
    repartition_par_classe: list[PartageRepartitionItem]


class PartageExposition(BaseModel):
    valeur_totale: float | None
    repartition_geo: list[PartageRepartitionItem]
    repartition_classe: list[PartageRepartitionItem]
    plus_grosse_ligne_pct: float | None
    top5_lignes_pct: float | None
    premiere_zone_geo: str | None
    premiere_zone_geo_pct: float | None


class PartagePerformance(BaseModel):
    valeur_totale: float | None
    cout_total_investi: float | None
    gain_perte_total: float | None
    rendement_simple_pct: float | None
    rendement_annualise_pct: float | None
    dividendes_percus: float | None
    frais_payes: float | None


class PartageBudget(BaseModel):
    periode_debut: str
    periode_fin: str
    entrees: float | None
    sorties: float | None
    disponible: float | None
    repartition_sorties: list[PartageRepartitionItem]


class PartageObjectif(BaseModel):
    nom: str
    type: str
    echeance: str
    progression_pct: float | None
    diagnostic: str
    retard_mois: int | None


class PartagePayload(BaseModel):
    """Réponse de `POST /api/partage/public/{token}` — jamais les schémas internes
    tels quels (cf. `services/partage_service.compute_payload`)."""

    nom_lien: str
    masque: bool
    detenteur_id: int | None
    patrimoine_net: PartagePatrimoineNet | None
    exposition: PartageExposition | None
    performance: PartagePerformance | None
    budget: PartageBudget | None
    objectifs: list[PartageObjectif] | None


class IndicateursSituation(BaseModel):
    matelas_securite_mois: float | None
    taux_endettement_pct: float | None
    part_immobilisee_pct: float | None
    epargne_disponible: float
    depenses_mensuelles_moyennes: float | None
    mensualites_totales: float
    revenus_nets_mensuels_moyens: float | None


class DeclarationPatrimoineRequest(BaseModel):
    """Backlog 2.Q.2 — `services/declaration_patrimoine_service.generer_pdf_declaration`.
    `holding_ids`/`loan_ids` à `None` = toutes les lignes du foyer ; une liste (même
    vide) restreint explicitement la sélection."""

    holding_ids: list[int] | None = None
    loan_ids: list[int] | None = None
    detenteur_id: int | None = None
    destinataire: str | None = None
    inclure_profil: bool = False

    @field_validator("destinataire")
    @classmethod
    def _valider_destinataire(cls, v: str | None) -> str | None:
        return v.strip() or None if v else None
