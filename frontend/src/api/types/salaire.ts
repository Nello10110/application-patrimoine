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
