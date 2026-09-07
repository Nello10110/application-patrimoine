import { describe, expect, it } from 'vitest'
import { bornesPeriode, deltaSurPeriode, libellePeriodeEcoulee, type Periode, variationSurPeriode } from './periode'

// Date de référence fixe pour des tests déterministes (2026 n'est pas bissextile).
const MAINTENANT = new Date('2026-08-21T12:00:00Z')

describe('bornesPeriode', () => {
  it('"TOUT" ne filtre rien (null)', () => {
    expect(bornesPeriode({ type: 'relative', valeur: 'TOUT' }, MAINTENANT)).toBeNull()
  })

  it('"1M" recule d\'un mois depuis aujourd\'hui', () => {
    expect(bornesPeriode({ type: 'relative', valeur: '1M' }, MAINTENANT)).toEqual({ dateDebut: '2026-07-21', dateFin: '2026-08-21' })
  })

  it('"3M" recule de trois mois', () => {
    expect(bornesPeriode({ type: 'relative', valeur: '3M' }, MAINTENANT)).toEqual({ dateDebut: '2026-05-21', dateFin: '2026-08-21' })
  })

  it('"6M" recule de six mois', () => {
    expect(bornesPeriode({ type: 'relative', valeur: '6M' }, MAINTENANT)).toEqual({ dateDebut: '2026-02-21', dateFin: '2026-08-21' })
  })

  it('"YTD" démarre au 1er janvier de l\'année courante', () => {
    expect(bornesPeriode({ type: 'relative', valeur: 'YTD' }, MAINTENANT)).toEqual({ dateDebut: '2026-01-01', dateFin: '2026-08-21' })
  })

  it('"1A" recule d\'un an', () => {
    expect(bornesPeriode({ type: 'relative', valeur: '1A' }, MAINTENANT)).toEqual({ dateDebut: '2025-08-21', dateFin: '2026-08-21' })
  })

  it('"3A" recule de trois ans', () => {
    expect(bornesPeriode({ type: 'relative', valeur: '3A' }, MAINTENANT)).toEqual({ dateDebut: '2023-08-21', dateFin: '2026-08-21' })
  })

  it('une période personnalisée renvoie ses propres bornes, sans dépendre de "maintenant"', () => {
    const periode: Periode = { type: 'personnalisee', dateDebut: '2020-01-01', dateFin: '2020-12-31' }
    expect(bornesPeriode(periode, MAINTENANT)).toEqual({ dateDebut: '2020-01-01', dateFin: '2020-12-31' })
  })
})

describe('libellePeriodeEcoulee (backlog 2.K.6)', () => {
  it.each<[Periode, string]>([
    [{ type: 'relative', valeur: 'TOUT' }, 'depuis le début du suivi'],
    [{ type: 'relative', valeur: 'YTD' }, 'depuis janvier'],
    [{ type: 'relative', valeur: '1M' }, 'sur le dernier mois'],
    [{ type: 'relative', valeur: '3M' }, 'sur les 3 derniers mois'],
    [{ type: 'relative', valeur: '6M' }, 'sur les 6 derniers mois'],
    [{ type: 'relative', valeur: '1A' }, 'sur la dernière année'],
    [{ type: 'relative', valeur: '3A' }, 'sur les 3 dernières années'],
    [{ type: 'personnalisee', dateDebut: '2020-01-01', dateFin: '2020-12-31' }, 'sur la période sélectionnée'],
  ])('%o → %s', (periode, attendu) => {
    expect(libellePeriodeEcoulee(periode)).toBe(attendu)
  })
})

describe('variationSurPeriode (backlog 2.K.6)', () => {
  it('calcule la variation en % entre le premier et le dernier point', () => {
    expect(variationSurPeriode([{ valeur: 1000 }, { valeur: 1050 }, { valeur: 1100 }])).toBeCloseTo(10)
  })

  it('gère une baisse (variation négative)', () => {
    expect(variationSurPeriode([{ valeur: 1000 }, { valeur: 900 }])).toBeCloseTo(-10)
  })

  it('renvoie null avec moins de 2 points', () => {
    expect(variationSurPeriode([])).toBeNull()
    expect(variationSurPeriode([{ valeur: 1000 }])).toBeNull()
  })

  it('renvoie null si le point de départ vaut 0 (variation indéfinie)', () => {
    expect(variationSurPeriode([{ valeur: 0 }, { valeur: 500 }])).toBeNull()
  })

  // Retour utilisateur du 07/09/2026 : « ↑ 22 008,2 % » sur la période « Tout ».
  it("renvoie null quand le patrimoine est parti de presque rien (rapport > 10)", () => {
    expect(variationSurPeriode([{ valeur: 1400 }, { valeur: 315000 }])).toBeNull()
  })

  it("garde le pourcentage tant que le rapport reste lisible (jusqu'à ×10)", () => {
    expect(variationSurPeriode([{ valeur: 1000 }, { valeur: 10000 }])).toBeCloseTo(900)
    expect(variationSurPeriode([{ valeur: 1000 }, { valeur: 10001 }])).toBeNull()
  })

  // Un patrimoine net PEUT être négatif (emprunts supérieurs aux actifs) : diviser
  // par un nombre négatif inversait le signe et annonçait une baisse là où la
  // situation s'était améliorée.
  it('renvoie null quand le point de départ est négatif', () => {
    expect(variationSurPeriode([{ valeur: -5000 }, { valeur: 1000 }])).toBeNull()
  })
})

describe('deltaSurPeriode (correction du 07/09/2026)', () => {
  it('donne la variation en euros, y compris là où le pourcentage est écarté', () => {
    expect(deltaSurPeriode([{ valeur: 1400 }, { valeur: 315000 }])).toBe(313600)
    expect(deltaSurPeriode([{ valeur: -5000 }, { valeur: 1000 }])).toBe(6000)
  })

  it('gère une baisse et renvoie null avec moins de 2 points', () => {
    expect(deltaSurPeriode([{ valeur: 1000 }, { valeur: 900 }])).toBe(-100)
    expect(deltaSurPeriode([{ valeur: 1000 }])).toBeNull()
  })
})
