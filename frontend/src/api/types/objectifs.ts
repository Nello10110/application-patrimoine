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
