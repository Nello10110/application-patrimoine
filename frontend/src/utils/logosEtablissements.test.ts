import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../api/client'
import { chargerLogos, invaliderLogos, logoDe, reinitialiserPourTests, sAbonner } from './logosEtablissements'

vi.mock('../api/client', () => ({ api: { getLogosEtablissements: vi.fn() } }))

const LOGOS = { '3': 'data:image/png;base64,AAA' }

describe('logosEtablissements', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    reinitialiserPourTests()
    vi.mocked(api.getLogosEtablissements).mockResolvedValue(LOGOS)
  })

  it("n'appelle l'API qu'une seule fois, quel que soit le nombre de badges affichés", async () => {
    await Promise.all([chargerLogos(), chargerLogos(), chargerLogos()])

    expect(api.getLogosEtablissements).toHaveBeenCalledTimes(1)
    expect(logoDe(3)).toBe(LOGOS['3'])
    expect(logoDe(99)).toBeUndefined()
    expect(logoDe(null)).toBeUndefined()
  })

  it('un échec réseau ne remonte jamais : les badges retombent simplement sur le repli', async () => {
    vi.mocked(api.getLogosEtablissements).mockRejectedValue(new Error('réseau coupé'))

    await expect(chargerLogos()).resolves.toEqual({})
    expect(logoDe(3)).toBeUndefined()
  })

  it('invalider recharge et prévient les abonnés (badges déjà montés ailleurs)', async () => {
    await chargerLogos()
    const abonne = vi.fn()
    sAbonner(abonne)

    invaliderLogos()

    expect(abonne).toHaveBeenCalled()
    await vi.waitFor(() => expect(api.getLogosEtablissements).toHaveBeenCalledTimes(2))
  })

  it('se désabonner arrête les notifications (composant démonté)', async () => {
    await chargerLogos()
    const abonne = vi.fn()
    const desabonner = sAbonner(abonne)

    desabonner()
    invaliderLogos()

    expect(abonne).not.toHaveBeenCalled()
  })
})
