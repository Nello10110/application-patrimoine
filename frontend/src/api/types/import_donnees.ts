/** Aperçu d'un fichier d'export avant import (backlog X.6) : décompte par table,
 * pour annoncer ce qui va REMPLACER l'existant avant que l'utilisateur ne
 * s'engage. `contenu` est volontairement un dictionnaire ouvert — les tables
 * exportées évoluent avec le modèle, et l'écran se contente de les lister. */
export interface ApercuImportDonnees {
  exporte_le: string | null
  contenu: Record<string, number>
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

export interface TransactionImportResult {
  lignes_lues: number
  importees: number
  doublons_ignores: number
  mouvements_hors_bourse_exclus: number
  positions_recalculees: number
  anomalies_detectees: number
  lignes_manuelles_remplacees: number
}
