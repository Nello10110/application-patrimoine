import { describe, expect, it } from 'vitest'
import { bornesPeriode, type Periode } from './periode'

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
