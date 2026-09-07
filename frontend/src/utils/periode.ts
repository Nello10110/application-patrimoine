/** Période transverse (backlog 2.K.3) : fenêtre glissante relative à aujourd'hui,
 * ou plage personnalisée — s'applique au graphique d'évolution du patrimoine et au
 * Rapport (cf. `PreferencesAffichageContext`). */

import { dateVersISO } from './format'

/** Cinq périodes, libellés courts (maquette de la refonte, 07/09/2026). Les sept
 * d'avant portaient des libellés longs (« Depuis janvier », « 3 mois ») qui
 * forçaient le sélecteur sur deux lignes dès qu'il vivait à côté de la courbe, et
 * le poussaient hors écran sur mobile. Deux disparaissent (« 6 mois » et « Depuis
 * janvier »), « 3 ans » devient « 5A » — une projection de patrimoine se juge sur
 * un horizon plus long. */
export type PeriodeRelative = '1M' | '3M' | '1A' | '5A' | 'TOUT'
export type Periode = { type: 'relative'; valeur: PeriodeRelative } | { type: 'personnalisee'; dateDebut: string; dateFin: string }

export const PERIODES_RELATIVES: { valeur: PeriodeRelative; label: string }[] = [
  { valeur: '1M', label: '1M' },
  { valeur: '3M', label: '3M' },
  { valeur: '1A', label: '1A' },
  { valeur: '5A', label: '5A' },
  { valeur: 'TOUT', label: 'Tout' },
]

/** Une période lue depuis `localStorage` peut dater d'avant ce resserrage (« 6M »,
 * « YTD », « 3A ») : sans cette vérification, `MOIS_PAR_PERIODE` renverrait
 * `undefined` et toutes les bornes deviendraient des dates invalides. */
export function estPeriodeRelativeConnue(valeur: unknown): valeur is PeriodeRelative {
  return PERIODES_RELATIVES.some((p) => p.valeur === valeur)
}

const MOIS_PAR_PERIODE: Record<Exclude<PeriodeRelative, 'TOUT'>, number> = { '1M': 1, '3M': 3, '1A': 12, '5A': 60 }

/** `null` = pas de filtrage (`TOUT`, ou aucune restriction). `maintenant` est
 * injectable pour des tests déterministes. */
export function bornesPeriode(periode: Periode, maintenant = new Date()): { dateDebut: string; dateFin: string } | null {
  if (periode.type === 'personnalisee') return { dateDebut: periode.dateDebut, dateFin: periode.dateFin }

  if (periode.valeur === 'TOUT') return null

  const dateFin = dateVersISO(maintenant)
  const debut = new Date(maintenant)
  debut.setMonth(debut.getMonth() - MOIS_PAR_PERIODE[periode.valeur])
  return { dateDebut: dateVersISO(debut), dateFin }
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
    case '1M':
      return 'sur le dernier mois'
    case '3M':
      return 'sur les 3 derniers mois'
    case '1A':
      return 'sur la dernière année'
    case '5A':
      return 'sur les 5 dernières années'
  }
}

/** Au-delà de ce rapport entre la valeur de départ et celle d'arrivée, le
 * pourcentage cesse d'informer (retour utilisateur du 07/09/2026 : « ↑ 22 008,2 % »
 * sur la période « Tout »).
 *
 * Le calcul était juste ; c'est la question qu'il répondait qui ne se posait pas.
 * Sur « Tout », le premier point de la série est le tout premier jour de suivi —
 * un patrimoine quasi vide, souvent quelques centaines d'euros avant qu'un bien
 * immobilier ne soit déclaré. Diviser par presque rien produit un nombre exact et
 * illisible : personne ne sait se représenter 22 008 %, et il ne dit RIEN de plus
 * que « le patrimoine était quasi nul au départ ».
 *
 * Le seuil ne masque donc pas un cas gênant : il marque la frontière au-delà de
 * laquelle un rapport n'est plus une variation mais un changement d'échelle. En
 * deçà (jusqu'à ×10, soit +900 %), le pourcentage reste interprétable — « mon
 * patrimoine a triplé » se lit. Le montant en euros, lui, reste affiché dans tous
 * les cas : il est toujours vrai et toujours lisible. */
const RAPPORT_MAX_INTERPRETABLE = 10

/** Variation en % entre le premier et le dernier point d'une série déjà filtrée sur
 * la période (cf. `bornesPeriode`). `null` quand le pourcentage n'aurait pas de
 * sens : moins de 2 points, point de départ nul ou NÉGATIF (un patrimoine net peut
 * l'être — diviser par un nombre négatif inverse le signe et affiche une baisse là
 * où la situation s'est améliorée), ou départ si petit devant l'arrivée que le
 * rapport n'est plus lisible (cf. `RAPPORT_MAX_INTERPRETABLE`). L'appelant affiche
 * alors le montant seul — cf. `deltaSurPeriode`.
 *
 * Fonction pure, générique sur `{ valeur }` : ne dépend pas du type exact des points
 * (réutilisable au-delà de `PortfolioHistoryPoint`). */
export function variationSurPeriode(points: { valeur: number }[]): number | null {
  if (points.length < 2) return null
  const debut = points[0].valeur
  const fin = points[points.length - 1].valeur
  if (debut <= 0) return null
  if (fin > debut * RAPPORT_MAX_INTERPRETABLE) return null
  return ((fin - debut) / debut) * 100
}

/** Variation en euros sur la même série — toujours définie dès qu'il y a deux
 * points, quels que soient les montants. C'est elle qui porte l'information quand
 * le pourcentage est écarté ci-dessus. */
export function deltaSurPeriode(points: { valeur: number }[]): number | null {
  if (points.length < 2) return null
  return points[points.length - 1].valeur - points[0].valeur
}
