// Types de l'API, découpés par domaine le 03/09/2026 (revue de qualité) : ce
// fichier faisait 1 085 lignes et 103 déclarations. Il ne fait plus que
// réexporter, pour qu'aucun `import type { X } from '../api/types'` existant
// n'ait à changer.

export type { AnalysisResponse, BenchmarkOption, CategoryCompositionItem, CategoryCompositionResponse, ComparaisonBenchmark, ComparaisonBenchmarkPoint, CoutGestionConsolide, DividendeLigne, DividendeMois, HoldingPriceHistoryResponse, HoldingPricePoint, MetriquesAvancees, PerformanceSummary, PortfolioHistoryPoint, PortfolioHistoryResponse, QualiteDonnees, RevenusPassifsProjetes, RiskIndicators } from './types/analyse'
export type { AccessLogEntry, AuthResponse, AuthUser, HouseholdMember, HouseholdMemberInput, OidcConfig, OidcConfigInput, OidcStatus, Role, Session } from './types/authentification'
export type { BudgetCible, BudgetColumnMapping, BudgetImportResult, BudgetSummary, CategorieBudget, JonctionPatrimoine, MouvementBancaire, RecurrenceDetectee, RegleCategorisation, RegleReapplicationResult, RepartitionSortieItem } from './types/budget'
export type { Detenteur, QuotiteDetenteurItem, QuotiteEntree, TypeDetenteur } from './types/detenteurs'
export type { ApercuImportDonnees, ColumnMapping, ImportPreview, ImportResult, TransactionImportResult } from './types/import_donnees'
export type { AllocationBreakdownItem, Compte, CompteAvecSolde, Etablissement, Holding, HoldingInput, HoldingUpdateInput, MarketData, RepartitionItem, RepartitionParClasseItem, ValorisationInput, ValuationHistoryPoint } from './types/noyau'
export type { ActifRattache, ContributeurObjectif, DiagnosticObjectif, IndicateursSituation, ObjectifDetail, ObjectifInput, TrajectoirePoint, TypeObjectif } from './types/objectifs'
export type { DeclarationPatrimoineInput, LienPartage, LienPartageInput, PartageBudget, PartageExposition, PartageMeta, PartageObjectif, PartagePatrimoineNet, PartagePayload, PartagePerformance, PartageRepartitionItem } from './types/partage'
export type { ExpositionConsolidee, FundTopHoldingItem, HoldingDetail, HoldingImmobilier, HoldingImmobilierInput, Loan, LoanInput, LoanUpdateInput, PatrimoineHistoryPoint, PatrimoineHistoryResponse, PatrimoineNet } from './types/patrimoine'
export type { MouvementRapport, RapportEpargnePeriode, RapportPeriode, RepartitionEpargneLigne } from './types/rapport'
export type { EtatRafraichissement, Preferences, PreferencesUpdateResponse, ScheduledJob, ZoneGeographiqueInfo } from './types/reglages'
export type { SalaireDonnees, SalaireIn, SalaireResume, SyntheseAnnee } from './types/salaire'
