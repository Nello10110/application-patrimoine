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
  // Versement mensuel récurrent déclaré (écran Épargne, backlog 2.S.1) — jamais
  // déduit automatiquement, additionné à `versement_mensuel_suggere` côté Simulateur.
  // Cf. `models.Holding.versement_mensuel` côté backend.
  versement_mensuel: number | null
  // Date d'acquisition du bien déclarée par l'utilisateur (retour utilisateur,
  // 26/08/2026) — distincte de `created_at` (date de saisie de la ligne) et de
  // `date_valeur_estimee` (dernière estimation). Cf. `models.Holding.date_acquisition`.
  date_acquisition: string | null
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
  versement_mensuel?: number | null
  // Format AAAA-MM-JJ, comme `ValorisationInput.date` — cf. `Holding.date_acquisition`.
  date_acquisition?: string | null
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
  versement_mensuel?: number | null
  date_acquisition?: string | null
}

// Point d'historique daté par l'utilisateur (backlog 2.S.1) — cf. `schemas.
// ValorisationInput` côté backend. `date` au format AAAA-MM-JJ.
export interface ValorisationInput {
  valeur: number
  date: string
  // Part de la hausse (ou baisse, valeur négative = retrait) depuis le point
  // précédent qui vient d'un versement plutôt que d'une performance du contrat
  // (backlog § U.2, retour utilisateur 30/08/2026) — optionnel.
  versement?: number | null
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
  // Lentille "financier" (feature Net/Brut/Financier sur toute la page Synthèse) :
  // même répartition, restreinte au seul portefeuille financier.
  repartition_par_classe_financiere: RepartitionParClasseItem[]
  // Lentille "net" : même répartition, chaque ligne nettée de SON emprunt rattaché
  // (pas seulement le grand total) — peut contenir des valeurs négatives (équité
  // négative sur une ligne, ou un bucket "Dettes non rattachées"), jamais masquées.
  repartition_par_classe_nette: RepartitionParClasseItem[]
}

// Historique combiné financier + immobilier/épargne − emprunts (feature Net/Brut/
// Financier sur toute la page Synthèse) — distinct de `PortfolioHistoryPoint`
// (financier seul). Cf. `services/patrimoine_history_service.py` pour les deux
// limites assumées : données manuelles clairsemées, ratio flou pour le scoping
// détenteur de la poche financière.
export interface PatrimoineHistoryPoint {
  date: string
  valeur_financiere: number
  valeur_manuelle: number
  actifs_totaux: number
  passifs_totaux: number
  patrimoine_net: number
  patrimoine_financier: number
  // Mode étagé Investi/Gains hors lentille Financier (backlog § U.3, 30/08/2026) —
  // mêmes noms que `PortfolioHistoryPoint`, même formule de décomposition côté
  // composant. La part manuelle de `valeur_investie` ne progresse qu'aux points où
  // un versement a été explicitement déclaré (`Holding`/`HoldingValuationHistory.
  // versement`, § U.2) ; `valeur_realisee_cumulee` reste exclusivement financière.
  valeur_investie: number
  valeur_realisee_cumulee: number
}

export interface PatrimoineHistoryResponse {
  points: PatrimoineHistoryPoint[]
}

// Exposition consolidée tous actifs (backlog 2.P.1) — une seule répartition géo/classe
// financier ET immobilier/épargne confondus, distincte de `AnalysisResponse` (portefeuille
// financier seul) et de `PatrimoineNet` (pas de vue géo/concentration).
// Champs sans suffixe = valeur BRUTE ; `_nette` = chaque ligne nettée de son emprunt
// rattaché (backlog 2.S.2) — même principe que `repartition_par_classe`/`_nette` du
// patrimoine net. `ExpositionConsolideeCard` choisit selon la lentille active.
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
  valeur_totale_nette: number
  repartition_geo_nette: RepartitionParClasseItem[]
  repartition_classe_nette: RepartitionParClasseItem[]
  plus_grosse_ligne_ticker_nette: string | null
  plus_grosse_ligne_pct_nette: number | null
  top5_lignes_pct_nette: number | null
  premiere_zone_geo_nette: string | null
  premiere_zone_geo_pct_nette: number | null
  part_estimee_manuelle_pct_nette: number
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

// Déclaration de patrimoine PDF paramétrable (backlog 2.Q.2). `null`/absent =
// toutes les lignes du foyer ; une liste (même vide) restreint explicitement.
export interface DeclarationPatrimoineInput {
  holding_ids?: number[] | null
  loan_ids?: number[] | null
  detenteur_id?: number | null
  destinataire?: string | null
  inclure_profil?: boolean
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

export interface AllocationBreakdownItem {
  categorie: string
  valeur: number
  pourcentage_reel: number
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
  // Taux d'imposition SAISI par l'utilisateur (backlog 2.Q.2) : une donnée reprise
  // telle quelle dans la déclaration de patrimoine, jamais un calcul fiscal.
  taux_imposition_pct: number | null
}

export interface PreferencesUpdateResponse extends Preferences {
  // Nombre de positions recalculées si le changement de méthode a déclenché une
  // reconstruction du portefeuille (LOT 5.6), `null` sinon.
  positions_recalculees: number | null
}

// Calculateur brut/net + taux d'épargne — PLUSIEURS entrées possibles par année (un
// revenu par conjoint, par exemple), chacune avec son propre taux d'imposition.
export interface SalaireIn {
  annee: number
  nom: string | null
  montant: number
  type_montant: 'brut' | 'net'
  periodicite: 'mensuel' | 'annuel'
  statut: 'cadre' | 'non_cadre'
  nombre_mois: number
  taux_imposition_pct: number | null
}

export interface SalaireResume extends SalaireIn {
  id: number
  nom: string
  brut_annuel: number
  brut_mensuel_moyen: number
  brut_par_versement: number
  net_avant_impot_annuel: number
  net_avant_impot_mensuel_moyen: number
  net_avant_impot_par_versement: number
  // `null` tant que le taux d'imposition de CETTE entrée n'est pas renseigné.
  net_apres_impot_annuel: number | null
  net_apres_impot_mensuel_moyen: number | null
}

// Agrégat de toutes les entrées d'une année — le taux d'épargne du foyer.
export interface SyntheseAnnee {
  annee: number
  nombre_salaires: number
  net_total_annuel: number
  toutes_les_entrees_ont_un_taux_imposition: boolean
  montant_investi_annee: number
  taux_epargne_pct: number | null
}

export interface SalaireDonnees {
  entrees: SalaireResume[]
  syntheses: SyntheseAnnee[]
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
  // Valeur courante manuelle et sa date (backlog 2.S.1) — "à jour au ..." sur
  // l'écran Épargne ; l'historique complet vient de `getHoldingValuationHistory`.
  valeur_estimee: number | null
  date_valeur_estimee: string | null
  versement_mensuel: number | null
  // Date d'acquisition déclarée (backlog § 2.S.3) — utilisée par
  // `rendement_annualise_pct` ci-dessus et pour ancrer le graphique d'historique de
  // valorisation (`ValorisationHistoriqueCard`).
  date_acquisition: string | null
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
  id: number
  date_valeur: string
  valeur: number
  versement: number | null
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

export interface RepartitionEpargneLigne {
  label: string
  valeur: number
}

// Bloc épargne du rapport (backlog § U.1, 30/08/2026) : `interets_estimes_periode`/
// `versements_estimes_periode` sont des ESTIMATIONS (l'épargne n'a pas de grand
// livre de versements contrairement au portefeuille financier), jamais des
// montants mesurés — à toujours étiqueter comme tels dans l'UI. `a_des_donnees`
// à `false` (avec tous les autres champs à leur valeur neutre) si le foyer n'a
// aucune ligne de type épargne : la page masque alors ce bloc entièrement.
// `decomposition_estimee` (backlog § U.2, 30/08/2026) : `true` (par défaut, aucun
// versement déclaré sur la période) — `interets_periode`/`versements_periode` sont
// une ESTIMATION (taux_pct proratisé, résidu). `false` — au moins un point de
// l'historique de la période porte un versement RÉELLEMENT déclaré par le foyer :
// `versements_periode` est alors la somme de ces montants, `interets_periode` le
// résidu de l'évolution — une donnée réelle, pas une estimation.
export interface RapportEpargnePeriode {
  a_des_donnees: boolean
  valeur_debut_periode: number
  valeur_fin_periode: number
  evolution_pct: number | null
  interets_periode: number
  versements_periode: number
  decomposition_estimee: boolean
  repartition_par_type: RepartitionEpargneLigne[]
}

export interface RapportPeriode {
  date_debut: string
  date_fin: string
  valeur_debut_periode: number | null
  valeur_fin_periode: number | null
  evolution_pct: number | null
  // Décomposition de l'évolution : argent AJOUTÉ (achats réels sur la période) vs
  // GÉNÉRÉ (plus-value + dividendes + intérêts) — jamais confondus.
  montant_investi_periode: number
  gain_genere_periode: number | null
  dividendes_percus: number
  nombre_transactions: number
  plus_gros_mouvements: MouvementRapport[]
  epargne: RapportEpargnePeriode
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
  // Somme des `Holding.versement_mensuel` déclarés sur les comptes Épargne (backlog
  // 2.S.1) — à ADDITIONNER à `versement_mensuel_suggere` côté Simulateur, jamais le
  // remplacer (les deux sources ne se recoupent jamais, cf. `budget_service.
  // compute_jonction_patrimoine`).
  versement_mensuel_epargne_declare: number
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
