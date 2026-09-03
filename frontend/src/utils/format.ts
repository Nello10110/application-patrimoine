/** Formatteurs partagés par toute l'application (locale française). */

// Masquer les montants (backlog 2.K.3) : espace réservé fixe, indépendant du signe
// et de l'ordre de grandeur — rien ne doit filtrer de la valeur réelle.
const MONTANT_MASQUE = '••••••'

// Formatteurs construits UNE fois, pas à chaque appel. `Intl.NumberFormat` est
// coûteux à instancier (un à deux ordres de grandeur de plus que `.format()`) et
// `formatEuro` est appelé depuis 155 endroits : la vue mensuelle du simulateur en
// déclenchait à elle seule plus de 2 000 constructions par rendu, refaites à chaque
// frappe dans les champs d'hypothèses (revue du 03/09/2026).
const FORMATTEURS_EURO: Record<0 | 2, Intl.NumberFormat> = {
  0: new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }),
  2: new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }),
}

export function formatEuro(value: number | null, decimales: 0 | 2 = 2, masque = false): string {
  if (masque) return MONTANT_MASQUE
  if (value === null) return '—'
  return FORMATTEURS_EURO[decimales].format(value)
}

/** Quantité détenue d'une position. Les positions reconstruites depuis l'historique
 * de transactions accumulent du bruit de virgule flottante (ex. 0.16835499999999995
 * au lieu de 0.168355) : arrondi à 8 décimales (précision suffisante même pour une
 * position crypto fractionnaire) avant formatage, zéros inutiles supprimés par
 * `toLocaleString`. */
const FORMATTEUR_QUANTITE = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 8 })

export function formatQuantite(value: number): string {
  return FORMATTEUR_QUANTITE.format(Number(value.toFixed(8)))
}

export function formatPct(value: number | null): string {
  if (value === null) return '—'
  return `${value > 0 ? '+' : ''}${value.toFixed(1)}%`
}

/** Sérialise une `Date` en "YYYY-MM-DD" d'après ses composantes LOCALES (jamais
 * `toISOString()`, qui convertit en UTC : pour un fuseau en avance sur UTC
 * — la France toute l'année —, minuit local le 1er du mois redevient le dernier
 * jour du mois précédent une fois converti, décalant silencieusement toute borne
 * de période construite en heure locale). */
export function dateVersISO(d: Date): string {
  const annee = d.getFullYear()
  const mois = String(d.getMonth() + 1).padStart(2, '0')
  const jour = String(d.getDate()).padStart(2, '0')
  return `${annee}-${mois}-${jour}`
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

const FORMATTEUR_DATE_HEURE = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' })

export function formatDateHeure(iso: string | null): string {
  if (!iso) return 'Jamais exécuté'
  return FORMATTEUR_DATE_HEURE.format(parseDateApi(iso))
}
