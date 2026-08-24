import { describe, expect, it } from 'vitest'
import { libelleTaux, valeurProjeteeUnAn } from './holdingCategories'

describe('valeurProjeteeUnAn (backlog 2.M.1)', () => {
  it('applique le taux positif (épargne) à la valeur estimée', () => {
    expect(valeurProjeteeUnAn(10000, 3)).toBeCloseTo(10300)
  })

  it('applique le taux négatif (décote véhicule) à la valeur estimée', () => {
    expect(valeurProjeteeUnAn(15000, -15)).toBeCloseTo(12750)
  })

  it('renvoie null si la valeur estimée ou le taux est absent', () => {
    expect(valeurProjeteeUnAn(null, 3)).toBeNull()
    expect(valeurProjeteeUnAn(10000, null)).toBeNull()
    expect(valeurProjeteeUnAn(null, null)).toBeNull()
  })
})

describe('libelleTaux (backlog 2.M.1)', () => {
  it("affiche « Décote annuelle » pour un véhicule", () => {
    expect(libelleTaux('VEHICLE')).toBe('Décote annuelle (%)')
  })

  it("affiche « Taux d'intérêt annuel » pour les autres types (épargne)", () => {
    expect(libelleTaux('REGULATED_SAVINGS')).toBe("Taux d'intérêt annuel (%)")
    expect(libelleTaux('EMPLOYEE_SAVINGS')).toBe("Taux d'intérêt annuel (%)")
  })
})
