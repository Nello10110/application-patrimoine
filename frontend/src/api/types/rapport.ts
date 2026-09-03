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
