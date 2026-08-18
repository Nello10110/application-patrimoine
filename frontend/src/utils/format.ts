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
