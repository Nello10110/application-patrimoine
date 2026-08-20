import { describe, expect, it } from 'vitest'
import { calculerTrajectoire } from './interetsComposes'

describe('calculerTrajectoire — intérêts composés mensuels + versement mensuel', () => {
  it('taux nul, sans versement : la valeur ne bouge jamais', () => {
    const points = calculerTrajectoire(1000, 0, 0, 3)
    expect(points.map((p) => p.valeur)).toEqual([1000, 1000, 1000, 1000])
    expect(points[3].investi).toBe(1000)
  })

  it('1000€ à 12%/an sur 1 an, sans versement ≈ 1000 × 1,01^12 (capitalisation mensuelle)', () => {
    const points = calculerTrajectoire(1000, 12, 0, 1)
    expect(points[1].valeur).toBeCloseTo(1000 * Math.pow(1.01, 12), 2)
    expect(points[1].investi).toBe(1000) // aucun versement : le capital versé ne bouge pas
  })

  it('versement mensuel constant sans capital ni rendement : simple accumulation', () => {
    const points = calculerTrajectoire(0, 0, 100, 2)
    expect(points[1].valeur).toBe(1200) // 12 × 100
    expect(points[2].valeur).toBe(2400) // 24 × 100
    expect(points[2].investi).toBe(2400)
  })
})
