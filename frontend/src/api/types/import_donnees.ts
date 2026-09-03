import type { Etablissement } from './noyau'

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
  // Nombre de `Compte` créés pour cet import (revue du 03/09/2026, import
  // multi-comptes) — au plus 4 (PEA/Compte-titres/Cryptomonnaie/Obligations).
  comptes_crees: number
}

// Clé de compte suggérée à l'import du grand livre (revue du 03/09/2026) — dérivée
// de `account_type`/`asset_class` par ligne, cf. `transaction_import.cle_compte`
// côté backend. Une clé absente de `comptages` (count = 0) n'a aucune ligne dans
// le fichier, aucun champ de saisie ne doit lui être proposé à l'écran.
export type CleCompte = 'pea' | 'compte_titres' | 'crypto' | 'obligations'

export interface TransactionImportApercu {
  file_token: string
  lignes_lues: number
  mouvements_hors_bourse_exclus: number
  comptages: Partial<Record<CleCompte, number>>
  // Partiel comme `comptages` ci-dessus : seules les clés effectivement présentes
  // dans le fichier reçoivent un nom par défaut (cf. `routers/transactions.py::
  // import_apercu`, qui ne construit ce dict que sur les clés de `comptages`).
  noms_par_defaut: Partial<Record<CleCompte, string>>
  etablissements: Etablissement[]
}

export interface TransactionImportConfirmInput {
  file_token: string
  // Même priorité id > nom que `HoldingInput.etablissement_id`/`etablissement_nom`.
  etablissement_id?: number | null
  etablissement_nom?: string | null
  // Une entrée par clé que l'utilisateur a renommée — absente = garde le nom par
  // défaut (`TransactionImportApercu.noms_par_defaut`).
  noms_comptes?: Partial<Record<CleCompte, string>>
}
