/** Période transverse (backlog 2.K.3) : fenêtre glissante relative à aujourd'hui,
 * ou plage personnalisée — s'applique au graphique d'évolution du patrimoine et au
 * Rapport (cf. `PreferencesAffichageContext`). */

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

// Hiérarchie de lecture du tableau de bord (backlog 2.K.6) : phrase en langage
// naturel accompagnant la variation du portefeuille suivi sur la Période transverse
// active — volontairement distincte du patrimoine net affiché juste au-dessus (qui
// inclut aussi l'immobilier/l'épargne/les dettes, sans historique daté disponible) :
// dire précisément ce qui est mesuré plutôt que de laisser croire à une variation du
// patrimoine net lui-même.
export function libellePeriodeEcoulee(periode: Periode): string {
  if (periode.type === 'personnalisee') return 'sur la période sélectionnée'
  switch (periode.valeur) {
    case 'TOUT':
      return 'depuis le début du suivi'
    case 'YTD':
      return 'depuis janvier'
    case '1M':
      return 'sur le dernier mois'
    case '3M':
      return 'sur les 3 derniers mois'
    case '6M':
      return 'sur les 6 derniers mois'
    case '1A':
      return 'sur la dernière année'
    case '3A':
      return 'sur les 3 dernières années'
  }
}

/** Variation en % entre le premier et le dernier point d'une série déjà filtrée sur
 * la période (cf. `bornesPeriode`) — `null` si moins de 2 points ou si le point de
 * départ vaut 0 (variation indéfinie). Fonction pure, générique sur `{ valeur }` :
 * ne dépend pas du type exact des points (réutilisable au-delà de
 * `PortfolioHistoryPoint`). */
export function variationSurPeriode(points: { valeur: number }[]): number | null {
  if (points.length < 2) return null
  const debut = points[0].valeur
  const fin = points[points.length - 1].valeur
  if (debut === 0) return null
  return ((fin - debut) / debut) * 100
}
