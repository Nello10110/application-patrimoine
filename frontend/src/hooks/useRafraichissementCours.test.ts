import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../api/client'
import type { EtatRafraichissement } from '../api/types'
import { useRafraichissementCours } from './useRafraichissementCours'

vi.mock('../api/client', () => ({
  api: {
    getRefreshStatus: vi.fn(),
  },
}))

function etat(overrides: Partial<EtatRafraichissement> = {}): EtatRafraichissement {
  return {
    en_cours: false,
    positions_traitees: 0,
    positions_total: 0,
    demarre_le: null,
    termine_le: null,
    statut: null,
    message: null,
    ...overrides,
  }
}

describe('useRafraichissementCours', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('au repos avant tout déclenchement', () => {
    const { result } = renderHook(() => useRafraichissementCours())

    expect(result.current.enCours).toBe(false)
    expect(result.current.etat).toBeNull()
    expect(result.current.erreur).toBeNull()
  })

  it('sonde toutes les 2 secondes tant que le rafraîchissement est en cours, puis appelle onTermine', async () => {
    vi.mocked(api.getRefreshStatus)
      // Sondage immédiat après le déclenchement.
      .mockResolvedValueOnce(etat({ en_cours: true, positions_traitees: 0, positions_total: 3 }))
      // Premier sondage périodique (2s plus tard).
      .mockResolvedValueOnce(etat({ en_cours: true, positions_traitees: 2, positions_total: 3 }))
      // Second sondage périodique : terminé.
      .mockResolvedValueOnce(etat({ en_cours: false, positions_traitees: 3, positions_total: 3, statut: 'ok' }))

    const onTermine = vi.fn()
    const { result } = renderHook(() => useRafraichissementCours(onTermine))
    const declencheur = vi.fn().mockResolvedValue(undefined)

    await act(async () => {
      await result.current.declencher(declencheur)
    })

    expect(declencheur).toHaveBeenCalledTimes(1)
    expect(result.current.enCours).toBe(true)
    expect(result.current.etat?.positions_total).toBe(3)
    expect(api.getRefreshStatus).toHaveBeenCalledTimes(1)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000)
    })
    expect(api.getRefreshStatus).toHaveBeenCalledTimes(2)
    expect(result.current.etat?.positions_traitees).toBe(2)
    expect(result.current.enCours).toBe(true)
    expect(onTermine).not.toHaveBeenCalled()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000)
    })
    expect(api.getRefreshStatus).toHaveBeenCalledTimes(3)
    expect(result.current.enCours).toBe(false)
    expect(result.current.etat?.statut).toBe('ok')
    expect(onTermine).toHaveBeenCalledTimes(1)

    // Le sondage doit s'être arrêté : aucun appel supplémentaire même après un
    // délai bien plus long que l'intervalle de sondage.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000)
    })
    expect(api.getRefreshStatus).toHaveBeenCalledTimes(3)
  })

  it("reflète un rafraîchissement terminé en erreur sans planter", async () => {
    vi.mocked(api.getRefreshStatus).mockResolvedValueOnce(
      etat({ en_cours: false, statut: 'erreur', message: 'panne simulée' }),
    )

    const { result } = renderHook(() => useRafraichissementCours())

    await act(async () => {
      await result.current.declencher(() => Promise.resolve())
    })

    expect(result.current.enCours).toBe(false)
    expect(result.current.etat?.statut).toBe('erreur')
    expect(result.current.etat?.message).toBe('panne simulée')
    expect(result.current.erreur).toBeNull()
  })

  it('affiche le message renvoyé par l\'API quand le déclenchement est refusé (429/409)', async () => {
    const declencheur = vi.fn().mockRejectedValue(new Error('Un rafraîchissement des cours est déjà en cours.'))

    const { result } = renderHook(() => useRafraichissementCours())

    await act(async () => {
      await result.current.declencher(declencheur)
    })

    expect(result.current.erreur).toBe('Un rafraîchissement des cours est déjà en cours.')
    expect(result.current.enCours).toBe(false)
    expect(api.getRefreshStatus).not.toHaveBeenCalled()
  })

  it('nettoie l\'intervalle de sondage au démontage du composant', async () => {
    vi.mocked(api.getRefreshStatus).mockResolvedValue(etat({ en_cours: true, positions_total: 1 }))
    const clearIntervalSpy = vi.spyOn(window, 'clearInterval')

    const { result, unmount } = renderHook(() => useRafraichissementCours())

    await act(async () => {
      await result.current.declencher(() => Promise.resolve())
    })
    expect(result.current.enCours).toBe(true)

    unmount()
    expect(clearIntervalSpy).toHaveBeenCalled()

    const appelsAvantAttente = vi.mocked(api.getRefreshStatus).mock.calls.length
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000)
    })
    // Aucun sondage supplémentaire après démontage : sans le nettoyage, ce test
    // échouerait (et un composant démonté recevrait un `setState` fantôme).
    expect(api.getRefreshStatus).toHaveBeenCalledTimes(appelsAvantAttente)
  })

  it("notifie la fin même si le rafraîchissement s'est terminé avant le premier sondage", async () => {
    // Portefeuille de quelques lignes : le travail de fond peut être fini avant que
    // l'effet de sondage n'ait eu l'occasion de démarrer. Sans notification immédiate,
    // l'écran appelant ne rechargerait jamais ses données.
    vi.mocked(api.getRefreshStatus).mockResolvedValue(etat({ statut: 'ok', positions_traitees: 3, positions_total: 3 }))
    const onTermine = vi.fn()

    const { result } = renderHook(() => useRafraichissementCours(onTermine))
    await act(async () => {
      await result.current.declencher(async () => undefined)
    })

    expect(onTermine).toHaveBeenCalledTimes(1)
    expect(result.current.enCours).toBe(false)
  })
})
