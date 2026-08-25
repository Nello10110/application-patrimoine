import { describe, expect, it } from 'vitest'
import { COEFFICIENT_NET_SUR_BRUT, estimerBrutNet } from './salaire'

describe('estimerBrutNet', () => {
  it('calcule le net depuis un brut (cadre)', () => {
    const { brut, net } = estimerBrutNet(3000, 'brut', 'cadre')
    expect(brut).toBe(3000)
    expect(net).toBe(3000 * COEFFICIENT_NET_SUR_BRUT.cadre)
  })

  it('calcule le brut depuis un net (non-cadre)', () => {
    const { brut, net } = estimerBrutNet(2340, 'net', 'non_cadre')
    expect(net).toBe(2340)
    expect(brut).toBeCloseTo(2340 / COEFFICIENT_NET_SUR_BRUT.non_cadre, 6)
  })

  it('les deux statuts appliquent des coefficients différents', () => {
    const cadre = estimerBrutNet(3000, 'brut', 'cadre')
    const nonCadre = estimerBrutNet(3000, 'brut', 'non_cadre')
    expect(cadre.net).not.toBe(nonCadre.net)
  })
})
