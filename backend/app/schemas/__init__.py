"""Schémas Pydantic (requêtes/réponses de l'API). Organisés dans l'ordre d'apparition
des routeurs qui les utilisent : portefeuille, marché, objectifs, analyse, transactions,
rentabilité, historique, fiche détaillée.

Les contraintes de saisie (LOT 3.2) sont posées ici, sur les schémas, plutôt que par
des `if` dispersés dans les routeurs : c'est le seul endroit que FastAPI consulte
avant même d'atteindre le code métier, et les messages d'erreur (levés via
`ValueError` dans les validateurs) sont rendus au client en français par le
gestionnaire d'erreurs global de `main.py`, qui les fait remonter en `400` plutôt
que le `422` par défaut de FastAPI.

Découpé par domaine le 03/09/2026 (revue de qualité) : ce module faisait 1 876
lignes et 119 classes. Ce `__init__` réexporte tout, pour qu'aucun
`from ..schemas import X` existant n'ait à changer.
"""

from .analyse import (  # noqa: F401
    AnalysisResponse,
    CoutGestionConsolide,
    QualiteDonnees,
    RiskIndicators,
)
from .authentification import (  # noqa: F401
    MESSAGE_MOT_DE_PASSE_TROP_COURT,
    MESSAGE_NOM_UTILISATEUR_INVALIDE,
    AccessLogEntryOut,
    AuthResponse,
    HouseholdMemberCreate,
    HouseholdMemberOut,
    LoginRequest,
    OidcStatus,
    RegisterRequest,
    SessionOut,
    UserOut,
)
from .budget import (  # noqa: F401
    BudgetCibleOut,
    BudgetCibleUpdate,
    BudgetColumnMapping,
    BudgetImportResult,
    BudgetSummary,
    CategorieBudgetCreate,
    CategorieBudgetOut,
    CategorieBudgetUpdate,
    JonctionPatrimoine,
    MouvementBancaireOut,
    MouvementCategorisationUpdate,
    RecurrenceDetecteeOut,
    RegleCategorisationCreate,
    RegleCategorisationOut,
    RegleReapplicationResult,
    RepartitionSortieItem,
)
from .commun import (  # noqa: F401
    AllocationBreakdownItem,
    CategoryCompositionItem,
    CategoryCompositionResponse,
    ImportPreviewResponse,
    RepartitionItem,
    RepartitionParClasseItem,
    ZoneGeographiqueInfo,
)
from .comptes import (  # noqa: F401
    CompteAvecSoldeOut,
    CompteBase,
    CompteCreate,
    CompteOut,
    CompteUpdate,
    EtablissementBase,
    EtablissementCreate,
    EtablissementOut,
    EtablissementUpdate,
)
from .detenteurs import (  # noqa: F401
    TYPES_DETENTEUR_VALIDES,
    DetenteurBase,
    DetenteurCreate,
    DetenteurOut,
    DetenteurUpdate,
    QuotiteDetenteurItem,
    QuotiteEntree,
    QuotitesUpdate,
)
from .donnees_marche import (  # noqa: F401
    EtatRafraichissement,
    MarketDataOut,
)
from .emprunts import (  # noqa: F401
    LoanBase,
    LoanCreate,
    LoanOut,
    LoanUpdate,
)
from .export import (  # noqa: F401
    DeclarationPatrimoineRequest,
)
from .objectifs import (  # noqa: F401
    ActifRattacheOut,
    ContributeurObjectifOut,
    ObjectifCreate,
    ObjectifDetail,
    TrajectoirePoint,
)
from .partage import (  # noqa: F401
    LienPartageCreate,
    LienPartageOut,
    PartageAccesRequest,
    PartageBudget,
    PartageExposition,
    PartageObjectif,
    PartagePatrimoineNet,
    PartagePayload,
    PartagePerformance,
    PartageRepartitionItem,
)
from .patrimoine import (  # noqa: F401
    ExpositionConsolidee,
    IndicateursSituation,
    PatrimoineHistoryPoint,
    PatrimoineHistoryResponse,
    PatrimoineNetResponse,
)
from .performance import (  # noqa: F401
    BenchmarkOption,
    ComparaisonBenchmark,
    ComparaisonBenchmarkPoint,
    DividendeLigne,
    DividendeMois,
    MetriquesAvancees,
    MouvementRapport,
    PerformanceSummary,
    PortfolioHistoryPoint,
    PortfolioHistoryResponse,
    RapportEpargnePeriode,
    RapportPeriode,
    RepartitionEpargneLigne,
    RevenusPassifsProjetes,
)
from .portefeuille import (  # noqa: F401
    MESSAGE_CHARGES_NON_NEGATIVES,
    MESSAGE_FRAIS_NON_NEGATIFS,
    MESSAGE_LOYER_NON_NEGATIF,
    MESSAGE_PIECES_POSITIVES,
    MESSAGE_SURFACE_POSITIVE,
    ColumnMapping,
    FundTopHoldingItem,
    HoldingBase,
    HoldingCreate,
    HoldingDetail,
    HoldingImmobilierOut,
    HoldingImmobilierUpdate,
    HoldingOut,
    HoldingPriceHistoryResponse,
    HoldingPricePoint,
    HoldingUpdate,
    ImportResult,
    TransactionImportApercu,
    TransactionImportConfirm,
    TransactionImportResult,
    ValorisationInput,
    ValuationHistoryPoint,
)
from .reglages import (  # noqa: F401
    Preferences,
    PreferencesUpdate,
    PreferencesUpdateResponse,
    ScheduledJobOut,
    ScheduledJobUpdate,
)
from .salaire import (  # noqa: F401
    SalaireDonnees,
    SalaireIn,
    SalaireResume,
    SyntheseAnnee,
)
from .validateurs import (  # noqa: F401
    MESSAGE_PRIX_NON_NEGATIF,
    MESSAGE_QUANTITE_POSITIVE,
    MESSAGE_TICKER_VIDE,
    MESSAGE_VALEUR_ESTIMEE_NON_NEGATIVE,
    _normaliser_ticker,
    _valider_date_jour_non_future,
)
