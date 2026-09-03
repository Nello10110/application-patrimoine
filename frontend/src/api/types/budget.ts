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
