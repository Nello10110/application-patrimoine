/** Construit une regex tolérante au format `Intl.NumberFormat('fr-FR', { style:
 * 'currency', currency: 'EUR' })` utilisé par `formatEuro` (`src/utils/format.ts`) :
 * espace insécable (normal ou étroit, ` `/` `) comme séparateur de
 * milliers, virgule comme séparateur décimal. Évite de coder en dur le caractère
 * d'espace exact rendu par le navigateur, qui varie selon la version d'ICU. */
export function montantRegex(valeur: number, decimales: 0 | 2 = 0): RegExp {
  const arrondi = decimales === 0 ? Math.round(valeur) : Math.round(valeur * 100) / 100
  const [entier, decimalePartie] = Math.abs(arrondi).toFixed(decimales).split('.')
  const groupes = entier.replace(/\B(?=(\d{3})+(?!\d))/g, ' ').split(' ')
  const entierRegex = groupes.join('[\\s\\u00A0\\u202F]?')
  const suffixe = decimalePartie ? `,${decimalePartie}` : ''
  const signe = arrondi < 0 ? '-' : ''
  return new RegExp(`${signe}${entierRegex}${suffixe}[\\s\\u00A0\\u202F]?€`)
}
