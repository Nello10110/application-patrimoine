// Multi-utilisateur (Milestone 1) — `AuthResponse` est la réponse commune de
// `/auth/register` et `/auth/login`.
export type Role = 'proprietaire' | 'membre' | 'invite'

export interface AuthUser {
  id: number
  username: string
  role: Role
}

export interface AuthResponse {
  token: string
  user: AuthUser
}

// Sessions et journal d'accès (backlog 2.L.2).
export interface Session {
  id_session: string
  created_at: string
  expires_at: string
  derniere_utilisation: string
  ip: string | null
  user_agent: string | null
  est_courante: boolean
}

export interface AccessLogEntry {
  id: number
  timestamp: string
  username_saisi: string
  ip: string | null
  action: 'login' | 'logout'
  resultat: 'succes' | 'echec'
  raison: string | null
}

// Comptes du foyer — membre/invité (backlog 2.L.2), créés exclusivement par le
// propriétaire depuis Réglages (l'auto-inscription se ferme après le tout premier
// compte, cf. `routers/auth.py`).
export interface HouseholdMemberInput {
  username: string
  password: string
  role: 'membre' | 'invite'
  detenteur_ids?: number[]
}

export interface HouseholdMember {
  id: number
  username: string
  role: Role
  created_at: string
  detenteur_ids: number[]
}

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
  // Valorisation manuelle (immobilier/SCPI/assurance-vie/PER — roadmap Phase 1) :
  // montant ABSOLU en euros, prioritaire sur `prix * quantite` quand renseigné.
  // `date_valeur_estimee` n'est jamais saisie par l'utilisateur, posée côté serveur.
  valeur_estimee: number | null
  date_valeur_estimee: string | null
}

export interface HoldingInput {
  ticker: string
  nom?: string | null
  quantite: number
  prix_revient_moyen?: number | null
  compte?: string | null
  devise?: string | null
  type_actif?: string | null
  valeur_estimee?: number | null
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
  valeur_estimee?: number | null
}

// Types d'actifs valorisés manuellement (roadmap Phase 1, patrimoine net) — aucune
// cotation automatique, `Holding.valeur_estimee` porte leur valeur. Cf.
// `models.TYPES_ACTIF_PATRIMOINE_MANUEL` côté backend.
export const TYPES_ACTIF_PATRIMOINE_MANUEL = ['REAL_ESTATE', 'SCPI', 'LIFE_INSURANCE', 'PENSION'] as const
export type TypeActifPatrimoineManuel = (typeof TYPES_ACTIF_PATRIMOINE_MANUEL)[number]

// Emprunt (roadmap Phase 1, patrimoine net) — premier passif de l'application.
// `capital_restant_du` est toujours calculé côté serveur (`loan_service.py`), jamais
// recalculé côté frontend.
export interface Loan {
  id: number
  libelle: string
  capital_initial: number
  taux_annuel_pct: number
  mensualite: number
  date_debut: string
  duree_mois: number
  capital_restant_du_manuel: number | null
  derniere_maj_manuelle: string | null
  capital_restant_du: number
  // Rattachement à un actif (backlog 2.M.2).
  holding_id: number | null
  created_at: string
  updated_at: string
}

export interface LoanInput {
  libelle: string
  capital_initial: number
  taux_annuel_pct: number
  mensualite: number
  date_debut: string
  duree_mois: number
  capital_restant_du_manuel?: number | null
}

export interface LoanUpdateInput {
  libelle?: string
  capital_initial?: number
  taux_annuel_pct?: number
  mensualite?: number
  date_debut?: string
  duree_mois?: number
  capital_restant_du_manuel?: number | null
  holding_id?: number | null
}

export interface RepartitionParClasseItem {
  categorie: string
  valeur: number
}

// Patrimoine net global (roadmap Phase 1) — distinct de `AnalysisResponse.valeur_totale`
// (scopé au seul portefeuille financier) : couvre en plus l'immobilier/SCPI/
// assurance-vie/PER, et retranche les emprunts.
export interface PatrimoineNet {
  actifs_totaux: number
  passifs_totaux: number
  patrimoine_net: number
  patrimoine_financier: number
  repartition_par_classe: RepartitionParClasseItem[]
}

// Simulateur de patrimoine, tableau de détail et indépendance financière (roadmap
// Phase 2/3) : depuis la fusion des pages Simulateur et Outils, ces calculs sont
// faits côté client (`utils/interetsComposes.ts`) — plus de type de réponse API
// dédié, seul `PatrimoineNet.patrimoine_net` ci-dessus reste utilisé (pour
// préremplir le capital de départ).

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

export interface CoutGestionConsolide {
  valeur_fonds: number
  valeur_fonds_avec_ter_connu: number
  couverture_pct: number
  cout_annuel_estime: number
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
  // Détenteurs (backlog 2.L.1) : quotités saisies + part détenue/nette calculée.
  quotites: QuotiteDetenteurItem[]
}

// Personnes/sociétés du foyer et quotités (backlog 2.L.1).
export type TypeDetenteur = 'personne' | 'societe'

export interface Detenteur {
  id: number
  nom: string
  type: TypeDetenteur
  created_at: string
  updated_at: string
}

export interface QuotiteDetenteurItem {
  detenteur_id: number
  detenteur_nom: string
  quotite_pct: number
  part_detenue: number
  part_nette: number
}

export interface QuotiteEntree {
  detenteur_id: number
  quotite_pct: number
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

export interface MouvementRapport {
  date: string
  type: string
  symbol: string | null
  nom: string | null
  montant: number
}

export interface RapportPeriode {
  date_debut: string
  date_fin: string
  valeur_debut_periode: number | null
  valeur_fin_periode: number | null
  evolution_pct: number | null
  dividendes_percus: number
  nombre_transactions: number
  plus_gros_mouvements: MouvementRapport[]
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
