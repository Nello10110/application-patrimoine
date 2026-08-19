import { describe, expect, it } from 'vitest'
import { formatDate, formatDateHeure, formatEuro, formatPct, formatQuantite } from './format'

describe('formatEuro', () => {
  it('affiche un tiret cadratin pour une valeur nulle', () => {
    expect(formatEuro(null)).toBe('—')
  })

  it('affiche deux décimales par défaut', () => {
    expect(formatEuro(1234.5).replace(/\s/g, ' ')).toBe('1 234,50 €')
  })

  it('respecte le nombre de décimales demandé', () => {
    expect(formatEuro(1234.5, 0).replace(/\s/g, ' ')).toBe('1 235 €')
  })
})

describe('formatPct', () => {
  it('affiche un tiret cadratin pour une valeur nulle', () => {
    expect(formatPct(null)).toBe('—')
  })

  it('préfixe les valeurs positives par un signe +', () => {
    expect(formatPct(12.34)).toBe('+12.3%')
  })

  it("n'ajoute pas de signe pour les valeurs négatives", () => {
    expect(formatPct(-5.6)).toBe('-5.6%')
  })
})

describe('formatQuantite', () => {
  it('élimine le bruit de virgule flottante (LOT 6.11, ex. fiche LVMH)', () => {
    expect(formatQuantite(0.16835499999999995).replace(/\s/g, ' ')).toBe('0,168355')
  })

  it('affiche un entier sans décimale', () => {
    expect(formatQuantite(10).replace(/\s/g, ' ')).toBe('10')
  })

  it('conserve une quantité fractionnaire légitime (crypto)', () => {
    expect(formatQuantite(0.00034521).replace(/\s/g, ' ')).toBe('0,00034521')
  })
})

describe('formatDate', () => {
  it('convertit une date ISO en jj/mm/aaaa', () => {
    expect(formatDate('2024-03-07')).toBe('07/03/2024')
  })
})

describe('formatDateHeure', () => {
  it('affiche "Jamais exécuté" pour une valeur nulle', () => {
    expect(formatDateHeure(null)).toBe('Jamais exécuté')
  })

  it('ajoute le Z manquant avant interprétation (dates API en UTC sans fuseau)', () => {
    // Le conteneur de test tourne en UTC (cf. `TZ`) : sans le `Z` ajouté par
    // `parseDateApi`, cette date serait interprétée comme une heure locale déjà en
    // UTC et donnerait le même résultat — ce test verrouille surtout le format
    // jj/mm/aaaa hh:mm, la conversion de fuseau elle-même est testée indirectement.
    expect(formatDateHeure('2026-08-18T14:32:00')).toBe('18/08/2026 14:32')
  })

  it('accepte une date déjà suffixée par Z', () => {
    expect(formatDateHeure('2026-08-18T14:32:00Z')).toBe('18/08/2026 14:32')
  })
})
