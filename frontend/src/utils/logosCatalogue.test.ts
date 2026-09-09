import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../api/client'
import { chargerLogosCatalogue, logoCatalogueDe, reinitialiserPourTests } from './logosCatalogue'

vi.mock('../api/client', () => ({ api: { getLogosCatalogue: vi.fn() } }))

const LOGOS = { trade_republic: 'data:image/png;base64,AAA' }

describe('logosCatalogue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    reinitialiserPourTests()
    vi.mocked(api.getLogosCatalogue).mockResolvedValue(LOGOS)
  })

  it("n'appelle l'API qu'une seule fois, quel que soit le nombre de badges affichés", async () => {
    await Promise.all([chargerLogosCatalogue(), chargerLogosCatalogue(), chargerLogosCatalogue()])

    expect(api.getLogosCatalogue).toHaveBeenCalledTimes(1)
    expect(logoCatalogueDe('trade_republic')).toBe(LOGOS.trade_republic)
    expect(logoCatalogueDe('bnp_paribas')).toBeUndefined()
    expect(logoCatalogueDe(null)).toBeUndefined()
  })

  it('un échec réseau ne remonte jamais : les badges retombent simplement sur le repli', async () => {
    vi.mocked(api.getLogosCatalogue).mockRejectedValue(new Error('réseau coupé'))

    await expect(chargerLogosCatalogue()).resolves.toEqual({})
    expect(logoCatalogueDe('trade_republic')).toBeUndefined()
  })
})
