import type { AllocationBreakdownItem } from './noyau'

export interface RiskIndicators {
  valeur_totale: number
  nombre_lignes: number
  top_ligne_poids: number
  top_ligne_nom: string | null
  top_pays_poids: number
  top_pays_nom: string | null
  top_secteur_poids: number
  top_secteur_nom: string | null
  score_diversification: number
  lignes_sans_donnees: number
}

export interface QualiteDonnees {
  valeur_composition_reelle: number
  pct_composition_reelle: number
  valeur_estimee_par_indice: number
  pct_estimee_par_indice: number
  valeur_non_categorisee: number
  pct_non_categorisee: number
  valeur_sans_cotation: number
  pct_sans_cotation: number
}

export interface AnalysisResponse {
  valeur_totale: number
  geo: AllocationBreakdownItem[]
  sector: AllocationBreakdownItem[]
  risques: RiskIndicators
  qualite_donnees: QualiteDonnees
}

export interface PerformanceSummary {
  valeur_positions: number
  valeur_totale: number
  cout_total_investi: number
  gain_perte_total: number
  rendement_simple_pct: number | null
  rendement_annualise_pct: number | null
  dividendes_percus: number
  interets_percus: number
  autres_revenus: number
  frais_payes: number
  impots_preleves: number
  gains_realises: number
  gains_latents: number
  nombre_transactions: number
  premiere_transaction: string | null
}

export interface CoutGestionConsolide {
  valeur_fonds: number
  valeur_fonds_avec_ter_connu: number
  couverture_pct: number
  cout_annuel_estime: number
}

export interface CategoryCompositionItem {
  ticker: string
  nom: string | null
  valeur: number
}

export interface CategoryCompositionResponse {
  type: 'geo' | 'sector' | 'classe'
  categorie: string
  valeur_totale: number
  lignes: CategoryCompositionItem[]
}

export interface DividendeLigne {
  date: string
  symbol: string | null
  nom: string | null
  montant: number
}

export interface DividendeMois {
  mois: string // "AAAA-MM"
  montant_total: number
  lignes: DividendeLigne[]
}

export interface PortfolioHistoryPoint {
  date: string
  valeur_portefeuille: number
  valeur_investie: number
  valeur_realisee_cumulee: number
}

export interface PortfolioHistoryResponse {
  points: PortfolioHistoryPoint[]
}

// Métriques de performance de niveau professionnel (backlog 2.P.2).
export interface MetriquesAvancees {
  twr_cumule_pct: number | null
  twr_annualise_pct: number | null
  volatilite_annualisee_pct: number | null
  max_drawdown_pct: number | null
  drawdown_recupere: boolean | null
  semaines_recuperation: number | null
}

export interface BenchmarkOption {
  key: string
  label: string
}

// Revenus passifs projetés à 12 mois (backlog 2.P.3, absorbe C.2).
export interface RevenusPassifsProjetes {
  loyers_nets_annuels: number
  interets_livrets_annuels: number
  revenu_certain_annuel: number
  dividendes_estimes_annuels: number
  interets_courtage_estimes_annuels: number
  revenu_estime_annuel: number
  revenu_total_projete_annuel: number
  revenu_total_projete_mensuel: number
}

export interface ComparaisonBenchmarkPoint {
  date: string
  portefeuille_pct: number | null
  benchmark_pct: number | null
}

export interface ComparaisonBenchmark {
  benchmark_key: string
  label: string
  points: ComparaisonBenchmarkPoint[]
}

export interface HoldingPricePoint {
  date: string
  prix: number
}

export interface HoldingPriceHistoryResponse {
  points: HoldingPricePoint[]
  volatilite_annualisee_pct: number | null
  max_drawdown_pct: number | null
}
