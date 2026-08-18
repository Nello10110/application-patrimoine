import { describe, expect, it } from 'vitest'
import { formatDate, formatEuro, formatPct } from './format'

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

describe('formatDate', () => {
  it('convertit une date ISO en jj/mm/aaaa', () => {
    expect(formatDate('2024-03-07')).toBe('07/03/2024')
  })
})
