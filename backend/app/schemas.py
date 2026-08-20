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

from .services.preferences_service import METHODES_VALIDES

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


class PortfolioHistoryResponse(BaseModel):
    points: list[PortfolioHistoryPoint]


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


class PreferencesUpdate(BaseModel):
    methode_cout: str
    seuil_alerte_ecart_pct: float

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


class PreferencesUpdateResponse(Preferences):
    """Réponse de `PUT /api/settings/preferences` : les préférences enregistrées,
    plus le nombre de positions recalculées si le changement a déclenché une
    reconstruction du portefeuille (LOT 5.6 — uniquement quand `methode_cout`
    change réellement, `None` sinon)."""

    positions_recalculees: int | None = None


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
    repartition_par_classe: list[RepartitionParClasseItem]


class ZoneGeographiqueInfo(BaseModel):
    """Écran d'aide (FAQ) : une zone géographique et les pays qu'elle contient
    (`services/reference_indices.zones_geographiques`)."""

    zone: str
    pays: list[str]


MESSAGE_MOT_DE_PASSE_TROP_COURT = "Le mot de passe doit contenir au moins 8 caractères"


class RegisterRequest(BaseModel):
    email: str
    password: str

    @field_validator("email")
    @classmethod
    def _valider_email(cls, v: str) -> str:
        v = v.strip().lower()
        if "@" not in v or v.startswith("@") or v.endswith("@"):
            raise ValueError("Adresse email invalide")
        return v

    @field_validator("password")
    @classmethod
    def _valider_password(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError(MESSAGE_MOT_DE_PASSE_TROP_COURT)
        return v


class LoginRequest(BaseModel):
    email: str
    password: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str


class AuthResponse(BaseModel):
    token: str
    user: UserOut
