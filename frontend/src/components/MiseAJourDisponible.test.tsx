import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useRegisterSW } from 'virtual:pwa-register/react'
import MiseAJourDisponible from './MiseAJourDisponible'

vi.mock('virtual:pwa-register/react', () => ({ useRegisterSW: vi.fn() }))

function mockHook(needRefresh: boolean) {
  const updateServiceWorker = vi.fn()
  const setNeedRefresh = vi.fn()
  vi.mocked(useRegisterSW).mockReturnValue({
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [false, vi.fn()],
    updateServiceWorker,
  })
  return { updateServiceWorker, setNeedRefresh }
}

describe('MiseAJourDisponible', () => {
  it("n'affiche rien tant qu'aucune nouvelle version n'est détectée", () => {
    mockHook(false)

    render(<MiseAJourDisponible />)

    expect(screen.queryByText(/nouvelle version/)).not.toBeInTheDocument()
  })

  it('affiche la bannière et recharge au clic sur « Recharger »', () => {
    const { updateServiceWorker } = mockHook(true)

    render(<MiseAJourDisponible />)

    expect(screen.getByText(/Une nouvelle version de l'application est disponible/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Recharger' }))

    expect(updateServiceWorker).toHaveBeenCalledWith(true)
  })

  it('le clic sur « Plus tard » masque la bannière sans recharger', () => {
    const { updateServiceWorker, setNeedRefresh } = mockHook(true)

    render(<MiseAJourDisponible />)
    fireEvent.click(screen.getByRole('button', { name: 'Plus tard' }))

    expect(setNeedRefresh).toHaveBeenCalledWith(false)
    expect(updateServiceWorker).not.toHaveBeenCalled()
  })

  it('programme une vérification périodique de mise à jour une fois le service worker enregistré (retour utilisateur du 10/09/2026 — idle prolongé)', async () => {
    vi.useFakeTimers()
    try {
      mockHook(false)
      render(<MiseAJourDisponible />)

      const options = vi.mocked(useRegisterSW).mock.calls[0][0]
      const registration = { update: vi.fn() } as unknown as ServiceWorkerRegistration
      options?.onRegisteredSW?.('/sw.js', registration)

      expect(registration.update).not.toHaveBeenCalled()
      await vi.advanceTimersByTimeAsync(60 * 60 * 1000)
      expect(registration.update).toHaveBeenCalledTimes(1)

      await vi.advanceTimersByTimeAsync(60 * 60 * 1000)
      expect(registration.update).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })
})
