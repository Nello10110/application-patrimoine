/** Formatteurs partagés par toute l'application (locale française). */

export function formatEuro(value: number | null, decimales: 0 | 2 = 2): string {
  if (value === null) return '—'
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: decimales,
  }).format(value)
}

export function formatPct(value: number | null): string {
  if (value === null) return '—'
  return `${value > 0 ? '+' : ''}${value.toFixed(1)}%`
}

export function formatDate(isoDate: string): string {
  const [annee, mois, jour] = isoDate.split('-')
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
