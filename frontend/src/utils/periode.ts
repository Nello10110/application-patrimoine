/** Période transverse (backlog 2.K.3) : fenêtre glissante relative à aujourd'hui,
 * ou plage personnalisée — s'applique au graphique d'évolution du patrimoine et au
 * Rapport (cf. `PreferencesAffichageContext`). Volontairement distincte du
 * sélecteur "année" du Dashboard/Répartition/Objectifs (`AllocationTarget` est un
 * objectif intrinsèquement annuel, une fenêtre glissante "3 derniers mois" n'a pas
 * de sens pour lui) — celui-ci reste un contrôle séparé, non touché par ce module. */

export type PeriodeRelative = '1M' | '3M' | '6M' | 'YTD' | '1A' | '3A' | 'TOUT'
export type Periode = { type: 'relative'; valeur: PeriodeRelative } | { type: 'personnalisee'; dateDebut: string; dateFin: string }

export const PERIODES_RELATIVES: { valeur: PeriodeRelative; label: string }[] = [
  { valeur: '1M', label: '1 mois' },
  { valeur: '3M', label: '3 mois' },
  { valeur: '6M', label: '6 mois' },
  { valeur: 'YTD', label: 'Depuis janvier' },
  { valeur: '1A', label: '1 an' },
  { valeur: '3A', label: '3 ans' },
  { valeur: 'TOUT', label: 'Tout' },
]

const MOIS_PAR_PERIODE: Record<Exclude<PeriodeRelative, 'TOUT' | 'YTD'>, number> = { '1M': 1, '3M': 3, '6M': 6, '1A': 12, '3A': 36 }

function versISO(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/** `null` = pas de filtrage (`TOUT`, ou aucune restriction). `maintenant` est
 * injectable pour des tests déterministes. */
export function bornesPeriode(periode: Periode, maintenant = new Date()): { dateDebut: string; dateFin: string } | null {
  if (periode.type === 'personnalisee') return { dateDebut: periode.dateDebut, dateFin: periode.dateFin }

  if (periode.valeur === 'TOUT') return null

  const dateFin = versISO(maintenant)

  if (periode.valeur === 'YTD') {
    return { dateDebut: versISO(new Date(maintenant.getFullYear(), 0, 1)), dateFin }
  }

  const debut = new Date(maintenant)
  debut.setMonth(debut.getMonth() - MOIS_PAR_PERIODE[periode.valeur])
  return { dateDebut: versISO(debut), dateFin }
}

export const PERIODE_DEFAUT: Periode = { type: 'relative', valeur: 'TOUT' }
