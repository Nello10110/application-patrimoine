// Multi-utilisateur (Milestone 1) — `AuthResponse` est la réponse commune de
// `/auth/register` et `/auth/login`.
export type Role = 'proprietaire' | 'membre' | 'invite'

export interface AuthUser {
  id: number
  username: string
  role: Role
  // Métadonnées d'affichage pures (backlog SSO, claim mapping) — `null` pour un
  // compte mot de passe local, jamais utilisées pour l'authentification.
  email?: string | null
  nom?: string | null
}

export interface AuthResponse {
  token: string
  user: AuthUser
}

// Connexion SSO (OIDC applicatif) — `enabled` reflète si la configuration
// (Réglages → Connexion SSO, propriétaire) est complète, activée, sur ce déploiement.
// `display_name` : texte choisi par le propriétaire pour le bouton de connexion
// (jamais un nom de fournisseur figé dans le code).
export interface OidcStatus {
  enabled: boolean
  display_name: string
}

// Administration de la configuration (propriétaire) — `client_secret` n'apparaît
// jamais dans une réponse, seulement `secret_configure` (une valeur est enregistrée
// ou non). `cle_chiffrement_definie` reflète `PATRIMOINE_SECRET_KEY` côté serveur :
// sans elle, aucun secret ne peut être chiffré, donc enregistré. `claim_*` : nom du
// claim OIDC mappé vers chaque attribut utilisateur (valeurs par défaut standard si
// jamais personnalisées).
export interface OidcConfig {
  issuer: string | null
  client_id: string | null
  redirect_uri: string | null
  frontend_url: string | null
  secret_configure: boolean
  cle_chiffrement_definie: boolean
  enabled: boolean
  display_name: string
  claim_username: string
  claim_email: string
  claim_nom: string
}

export interface OidcConfigInput {
  issuer: string
  client_id: string
  redirect_uri: string
  frontend_url: string
  // Omis ou vide : le secret déjà enregistré est conservé tel quel.
  client_secret?: string
  enabled?: boolean
  display_name?: string
  claim_username?: string
  claim_email?: string
  claim_nom?: string
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
  email?: string | null
  nom?: string | null
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
  // Taux annuel informatif (backlog § 2.M.1) : positif = intérêt attendu (épargne
  // réglementée/salariale), négatif = décote attendue (véhicule) — jamais appliqué
  // automatiquement à `valeur_estimee`, cf. `models.Holding.taux_pct` côté backend.
  taux_pct: number | null
  // Zone géographique déclarée pour un actif valorisé manuellement (backlog 2.P.1) —
  // cf. `models.Holding.zone_geo` côté backend.
  zone_geo: string | null
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
  taux_pct?: number | null
  zone_geo?: string | null
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
  taux_pct?: number | null
  zone_geo?: string | null
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

// Exposition consolidée tous actifs (backlog 2.P.1) — une seule répartition géo/classe
// financier ET immobilier/épargne confondus, distincte de `AnalysisResponse` (portefeuille
// financier seul) et de `PatrimoineNet` (pas de vue géo/concentration).
export interface ExpositionConsolidee {
  valeur_totale: number
  repartition_geo: RepartitionParClasseItem[]
  repartition_classe: RepartitionParClasseItem[]
  plus_grosse_ligne_ticker: string | null
  plus_grosse_ligne_pct: number | null
  top5_lignes_pct: number | null
  premiere_zone_geo: string | null
  premiere_zone_geo_pct: number | null
  part_estimee_manuelle_pct: number
}

// Lien de partage révocable (backlog 2.Q.1) — gestion (réservée au propriétaire)
// et consultation publique (aucune authentification).
export interface LienPartage {
  id: number
  token: string
  nom: string
  detenteur_id: number | null
  inclure_patrimoine_net: boolean
  inclure_repartition: boolean
  inclure_performance: boolean
  inclure_budget: boolean
  inclure_objectifs: boolean
  masquer_valeurs: boolean
  code_requis: boolean
  created_at: string
  expires_at: string
  revoked_at: string | null
}

export interface LienPartageInput {
  nom: string
  detenteur_id?: number | null
  duree_jours?: number
  inclure_patrimoine_net?: boolean
  inclure_repartition?: boolean
  inclure_performance?: boolean
  inclure_budget?: boolean
  inclure_objectifs?: boolean
  masquer_valeurs?: boolean
  code?: string | null
}

export interface PartageMeta {
  nom_lien: string
  code_requis: boolean
}

export interface PartageRepartitionItem {
  categorie: string
  valeur: number | null
  pourcentage: number
}

export interface PartagePatrimoineNet {
  patrimoine_net: number | null
  actifs_totaux: number | null
  passifs_totaux: number | null
  repartition_par_classe: PartageRepartitionItem[]
}

export interface PartageExposition {
  valeur_totale: number | null
  repartition_geo: PartageRepartitionItem[]
  repartition_classe: PartageRepartitionItem[]
  plus_grosse_ligne_pct: number | null
  top5_lignes_pct: number | null
  premiere_zone_geo: string | null
  premiere_zone_geo_pct: number | null
}

export interface PartagePerformance {
  valeur_totale: number | null
  cout_total_investi: number | null
  gain_perte_total: number | null
  rendement_simple_pct: number | null
  rendement_annualise_pct: number | null
  dividendes_percus: number | null
  frais_payes: number | null
}

export interface PartageBudget {
  periode_debut: string
  periode_fin: string
  entrees: number | null
  sorties: number | null
  disponible: number | null
  repartition_sorties: PartageRepartitionItem[]
}

export interface PartageObjectif {
  nom: string
  type: string
  echeance: string
  progression_pct: number | null
  diagnostic: string
  retard_mois: number | null
}

export interface PartagePayload {
  nom_lien: string
  masque: boolean
  detenteur_id: number | null
  patrimoine_net: PartagePatrimoineNet | null
  exposition: PartageExposition | null
  performance: PartagePerformance | null
  budget: PartageBudget | null
  objectifs: PartageObjectif[] | null
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
  // Fiche immobilier complète (backlog 2.M.3) : `null` tant qu'aucun détail n'a été
  // saisi pour cette ligne.
  immobilier: HoldingImmobilier | null
}

// Fiche immobilier (backlog 2.M.3) : bloc location + caractéristiques saisis par
// l'utilisateur, cashflow/rentabilité/prix au m² calculés côté serveur (jamais
// recalculés côté frontend, même discipline que `Holding.valeur`).
export interface HoldingImmobilier {
  type_location: string | null
  loyer_mensuel: number | null
  charges_mensuelles: number | null
  frais_annuels: number | null
  surface_m2: number | null
  nb_pieces: number | null
  annee_construction: number | null
  dpe: string | null
  cashflow_mensuel: number | null
  rentabilite_brute_pct: number | null
  rentabilite_nette_pct: number | null
  prix_m2: number | null
  emprunt_mensualite: number | null
}

export interface HoldingImmobilierInput {
  type_location?: string | null
  loyer_mensuel?: number | null
  charges_mensuelles?: number | null
  frais_annuels?: number | null
  surface_m2?: number | null
  nb_pieces?: number | null
  annee_construction?: number | null
  dpe?: string | null
}

// Un point d'historique de valorisation (backlog 2.M.3) — jamais écrasé, contrairement
// à `Holding.valeur_estimee`/`date_valeur_estimee` (valeur courante seule).
export interface ValuationHistoryPoint {
  date_valeur: string
  valeur: number
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

// Budget (backlog 2.N.1/2.N.2)

export interface CategorieBudget {
  id: number
  nom: string
  parent_id: number | null
}

export interface RegleCategorisation {
  id: number
  motif: string
  categorie_id: number
}

export interface RegleReapplicationResult {
  mouvements_modifies: number
}

export interface MouvementBancaire {
  id: number
  date: string
  libelle: string
  montant: number
  compte: string | null
  categorie_id: number | null
  categorise_manuellement: boolean
}

export interface BudgetColumnMapping {
  file_token: string
  date_col: string
  libelle_col: string
  montant_col?: string | null
  debit_col?: string | null
  credit_col?: string | null
  compte?: string | null
}

export interface BudgetImportResult {
  lignes_lues: number
  importees: number
  doublons_ignores: number
  lignes_ignorees: number
  categorisees_automatiquement: number
}

export interface BudgetCible {
  categorie_id: number
  montant_mensuel: number
}

export interface RepartitionSortieItem {
  categorie_id: number | null
  categorie_nom: string
  montant: number
  cible_mensuelle: number | null
}

export interface BudgetSummary {
  entrees: number
  sorties: number
  disponible: number
  depenses_recurrentes_mensuelles: number
  repartition_sorties: RepartitionSortieItem[]
}

export interface RecurrenceDetectee {
  libelle: string
  categorie_id: number | null
  montant_actuel: number
  montant_precedent: number | null
  hausse_prix: boolean
  occurrences: number
  premiere_date: string
  derniere_date: string
  periodicite: 'mensuelle' | 'irreguliere'
}

export interface JonctionPatrimoine {
  taux_epargne_reel_pct: number | null
  reste_a_vivre: number | null
  versement_mensuel_suggere: number | null
  categorie_epargne_introuvable: boolean
  categorie_logement_introuvable: boolean
}

// Objectifs suivis et indicateurs de situation (backlog 2.O.1/2.O.2)

export type TypeObjectif = 'fire' | 'precaution' | 'immobilier' | 'remboursement' | 'personnalise'

export type DiagnosticObjectif = 'atteint' | 'echeance_depassee' | 'en_bonne_voie' | 'en_retard' | 'aucune_progression'

export interface TrajectoirePoint {
  date: string
  valeur: number
}

export interface ActifRattache {
  holding_id: number
  ticker: string
  nom: string | null
}

export interface ContributeurObjectif {
  id: number
  nom: string
}

export interface ObjectifDetail {
  id: number
  nom: string
  type: TypeObjectif
  montant_cible: number
  echeance: string
  rendement_hypothese_pct: number
  created_at: string
  valeur_a_la_creation: number
  valeur_actuelle: number
  progression_pct: number | null
  diagnostic: DiagnosticObjectif
  retard_mois: number | null
  rendement_requis_pct: number | null
  contribution_mensuelle_necessaire: number | null
  trajectoire_cible: TrajectoirePoint[]
  trajectoire_reelle: TrajectoirePoint[]
  actifs_rattaches: ActifRattache[]
  contributeurs: ContributeurObjectif[]
}

export interface ObjectifInput {
  nom: string
  type: TypeObjectif
  montant_cible: number
  echeance: string
  rendement_hypothese_pct: number
  holding_ids: number[]
  detenteur_ids: number[]
}

export interface IndicateursSituation {
  matelas_securite_mois: number | null
  taux_endettement_pct: number | null
  part_immobilisee_pct: number | null
  epargne_disponible: number
  depenses_mensuelles_moyennes: number | null
  mensualites_totales: number
  revenus_nets_mensuels_moyens: number | null
}
