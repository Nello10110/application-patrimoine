export interface MarketData {
  ticker: string
  nom: string | null
  prix_actuel: number | null
  devise: string | null
  secteur: string | null
  pays: string | null
  region: string | null
  erreur: string | null
  derniere_maj: string
}

// État du rafraîchissement des cours en tâche de fond (LOT 4B), renvoyé par
// `POST /market-data/refresh` (202, état de démarrage) et sondé via
// `GET /market-data/refresh/status` — également utilisé par "Lancer maintenant"
// depuis la page Réglages, qui déclenche le même exécuteur partagé.
export interface EtatRafraichissement {
  en_cours: boolean
  positions_traitees: number
  positions_total: number
  demarre_le: string | null
  termine_le: string | null
  statut: 'ok' | 'erreur' | null
  message: string | null
}

export interface Holding {
  id: number
  ticker: string
  nom: string | null
  quantite: number
  prix_revient_moyen: number | null
  compte: string | null
  devise: string | null
  type_actif: string | null
  // "manuel" (saisie à la main ou relevé importé) | "reconstruit" (grand livre de
  // transactions) — cf. LOT 3.4, `models.ORIGINE_MANUEL`/`ORIGINE_RECONSTRUIT`.
  origine: string
  created_at: string
  updated_at: string
  market_data: MarketData | null
  rendement_depuis_achat_pct: number | null
  rendement_annualise_pct: number | null
  // Valeur de la ligne calculée côté serveur (prix de marché, à défaut prix de
  // revient, `null` si aucun des deux n'est connu) — cf. `analysis_service.value_holdings`
  // côté backend. Le frontend n'a plus à refaire ce calcul (LOT 6.7).
  valeur: number | null
}

export interface HoldingInput {
  ticker: string
  nom?: string | null
  quantite: number
  prix_revient_moyen?: number | null
  compte?: string | null
  devise?: string | null
  type_actif?: string | null
}

// Champs modifiables via `PATCH /api/portfolio/holdings/{id}` (cf. `HoldingUpdate`
// côté backend, `schemas.py`) : tous optionnels, seuls les champs présents sont
// écrasés (`exclude_unset`) — omettre un champ le laisse inchangé en base.
export interface HoldingUpdateInput {
  ticker?: string
  nom?: string | null
  quantite?: number
  prix_revient_moyen?: number | null
  compte?: string | null
  devise?: string | null
  type_actif?: string | null
}

export interface ImportPreview {
  file_token: string
  columns: string[]
  rows: Record<string, string>[]
  total_rows: number
}

export interface ColumnMapping {
  file_token: string
  ticker_col: string
  quantite_col: string
  prix_revient_col?: string | null
  nom_col?: string | null
  compte_col?: string | null
  devise_col?: string | null
  replace_existing: boolean
}

export interface ImportResult {
  imported: number
  skipped: number
  errors: string[]
}

export interface AllocationTargetInput {
  categorie: string
  pourcentage_cible: number
}

export interface AllocationTargetsSet {
  annee: number
  geo: AllocationTargetInput[]
  sector: AllocationTargetInput[]
}

export interface AllocationTargetOut {
  id: number
  annee: number
  type: 'geo' | 'sector'
  categorie: string
  pourcentage_cible: number
}

export interface AllocationBreakdownItem {
  categorie: string
  valeur: number
  pourcentage_reel: number
  pourcentage_cible: number | null
  ecart: number | null
}

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

export interface RebalancingAction {
  type: 'geo' | 'sector'
  categorie: string
  ecart_pourcentage: number
  montant_a_ajuster: number
  sens: 'reduire' | 'augmenter'
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
  annee: number
  valeur_totale: number
  geo: AllocationBreakdownItem[]
  sector: AllocationBreakdownItem[]
  risques: RiskIndicators
  recommandations: RebalancingAction[]
  // Sous-ensemble de `recommandations` (LOT 5.5) dont l'écart absolu dépasse le
  // seuil réglable `seuil_alerte_ecart_pct` (cf. `Preferences`) — pas un recalcul.
  alertes: RebalancingAction[]
  qualite_donnees: QualiteDonnees
}

// Répartition de la VALEUR ACTUELLE par compte (LOT 5.1). Le compte est une
// annotation manuelle par ligne (`Holding.compte`) : le grand livre importé ne
// porte aucune information de compte, la rentabilité par compte n'est donc pas
// calculable — cf. `pas_de_rentabilite_par_compte`, à afficher tel quel à l'écran.
export interface RepartitionCompteItem {
  compte: string
  valeur: number
  pourcentage: number
}

export interface RepartitionComptesResponse {
  valeur_totale: number
  items: RepartitionCompteItem[]
  a_des_comptes_annotes: boolean
  pas_de_rentabilite_par_compte: string
}

// Réglages applicatifs persistants (LOT 5B).
export interface Preferences {
  methode_cout: 'cout_moyen_pondere' | 'fifo'
  seuil_alerte_ecart_pct: number
}

export interface PreferencesUpdateResponse extends Preferences {
  // Nombre de positions recalculées si le changement de méthode a déclenché une
  // reconstruction du portefeuille (LOT 5.6), `null` sinon (seuil seul modifié).
  positions_recalculees: number | null
}

export interface TransactionImportResult {
  lignes_lues: number
  importees: number
  doublons_ignores: number
  mouvements_hors_bourse_exclus: number
  positions_recalculees: number
  anomalies_detectees: number
  lignes_manuelles_remplacees: number
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

export interface RepartitionItem {
  categorie: string
  poids: number
}

export interface FundTopHoldingItem {
  symbol: string
  nom: string | null
  poids: number
  pays: string | null
  secteur: string | null
}

export interface HoldingDetail {
  ticker: string
  nom: string | null
  type_actif: string | null
  quantite: number
  prix_revient_moyen: number | null
  prix_actuel: number | null
  valeur: number
  devise: string | null
  secteur: string | null
  pays: string | null
  rendement_depuis_achat_pct: number | null
  rendement_annualise_pct: number | null
  emetteur: string | null
  resume: string | null
  frais_gestion_pct: number | null
  frais_transaction_payes: number
  repartition_geo: RepartitionItem[]
  repartition_sector: RepartitionItem[]
  repartition_geo_detaillee: RepartitionItem[]
  repartition_sector_detaillee: RepartitionItem[]
  composition_actions: FundTopHoldingItem[]
}

export interface CategoryCompositionItem {
  ticker: string
  nom: string | null
  valeur: number
}

export interface CategoryCompositionResponse {
  type: 'geo' | 'sector'
  categorie: string
  valeur_totale: number
  lignes: CategoryCompositionItem[]
}

export interface PortfolioHistoryPoint {
  date: string
  valeur_portefeuille: number
  valeur_investie: number
}

export interface PortfolioHistoryResponse {
  points: PortfolioHistoryPoint[]
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

export interface ScheduledJob {
  job_key: string
  enabled: boolean
  intervalle_heures: number
  derniere_execution: string | null
  dernier_statut: 'ok' | 'erreur' | null
  dernier_message: string | null
}

// Écran d'aide (FAQ) : les 6 zones géographiques et leurs pays, en miroir de
// `services/reference_indices.zones_geographiques` côté backend — jamais une
// liste dupliquée à la main, pour rester toujours fidèle au classement réel.
export interface ZoneGeographiqueInfo {
  zone: string
  pays: string[]
}
