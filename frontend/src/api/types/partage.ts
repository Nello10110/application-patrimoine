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
