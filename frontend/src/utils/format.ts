/** Formatteurs partagés par toute l'application (locale française). */

// Masquer les montants (backlog 2.K.3) : espace réservé fixe, indépendant du signe
// et de l'ordre de grandeur — rien ne doit filtrer de la valeur réelle.
const MONTANT_MASQUE = '••••••'

export function formatEuro(value: number | null, decimales: 0 | 2 = 2, masque = false): string {
  if (masque) return MONTANT_MASQUE
  if (value === null) return '—'
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: decimales,
  }).format(value)
}

/** Quantité détenue d'une position. Les positions reconstruites depuis l'historique
 * de transactions accumulent du bruit de virgule flottante (ex. 0.16835499999999995
 * au lieu de 0.168355) : arrondi à 8 décimales (précision suffisante même pour une
 * position crypto fractionnaire) avant formatage, zéros inutiles supprimés par
 * `toLocaleString`. */
export function formatQuantite(value: number): string {
  return Number(value.toFixed(8)).toLocaleString('fr-FR', { maximumFractionDigits: 8 })
}

export function formatPct(value: number | null): string {
  if (value === null) return '—'
  return `${value > 0 ? '+' : ''}${value.toFixed(1)}%`
}

export function formatDate(isoDate: string): string {
  // Accepte aussi bien une date pure ("2026-01-01") qu'un horodatage complet
  // ("2026-01-01T00:00:00", ex. `Holding.date_valeur_estimee`) — sans ce découpage,
  // le "T..." final se retrouvait concaténé au jour ("01T00:00:00/01/2026").
  const [annee, mois, jour] = isoDate.split('T')[0].split('-')
  return `${jour}/${mois}/${annee}`
}

/** Les horodatages renvoyés par l'API sont en UTC mais sans indication de fuseau
 * (ex. "2026-08-18T14:32:00") : sans le `Z` ajouté avant interprétation, `Date` les
 * lirait comme une heure locale, décalée de l'heure du fuseau du navigateur. */
export function parseDateApi(iso: string): Date {
  return new Date(iso.endsWith('Z') ? iso : `${iso}Z`)
}

export function formatDateHeure(iso: string | null): string {
  if (!iso) return 'Jamais exécuté'
  return parseDateApi(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
}
