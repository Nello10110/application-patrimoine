import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../api/client'
import type { FireResult, Simulation } from '../api/types'
import SimulateurPage from './SimulateurPage'

vi.mock('../api/client', () => ({
  api: {
    getSimulation: vi.fn(),
    getFire: vi.fn(),
  },
}))

function simulation(overrides: Partial<Simulation> = {}): Simulation {
  return {
    valeur_depart: 10000,
    points: [
      { annee: 0, valeur: 10000 },
      { annee: 1, valeur: 10500 },
    ],
    ...overrides,
  }
}

function fireResult(overrides: Partial<FireResult> = {}): FireResult {
  return {
    valeur_depart: 10000,
    patrimoine_necessaire: 1000000,
    annees_avant_independance: 25.4,
    ...overrides,
  }
}

describe('SimulateurPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.getSimulation).mockResolvedValue(simulation())
    vi.mocked(api.getFire).mockResolvedValue(fireResult())
  })

  it('charge la projection au montage avec les hypothèses par défaut', async () => {
    render(<SimulateurPage />)

    await waitFor(() =>
      expect(api.getSimulation).toHaveBeenCalledWith({ rendement_annuel_pct: 5, epargne_mensuelle: 0, annees: 20 }),
    )
    await screen.findByText(/10 000 €/)
  })

  it('change de rendement recalcule la projection après un court délai', async () => {
    render(<SimulateurPage />)
    await waitFor(() => expect(api.getSimulation).toHaveBeenCalledTimes(1))

    fireEvent.change(screen.getByLabelText('Rendement annuel moyen (%)'), { target: { value: '7' } })

    await waitFor(() =>
      expect(api.getSimulation).toHaveBeenCalledWith({ rendement_annuel_pct: 7, epargne_mensuelle: 0, annees: 20 }),
    )
  })

  it('changer l\'horizon relance la projection avec la nouvelle durée', async () => {
    render(<SimulateurPage />)
    await waitFor(() => expect(api.getSimulation).toHaveBeenCalledTimes(1))

    fireEvent.click(screen.getByRole('button', { name: '10 ans' }))

    await waitFor(() =>
      expect(api.getSimulation).toHaveBeenCalledWith({ rendement_annuel_pct: 5, epargne_mensuelle: 0, annees: 10 }),
    )
  })

  it("n'appelle pas /fire tant qu'aucune dépense cible n'est saisie", async () => {
    render(<SimulateurPage />)
    await waitFor(() => expect(api.getSimulation).toHaveBeenCalledTimes(1))

    await screen.findByText('Renseigne une dépense annuelle cible pour voir le résultat.')
    expect(api.getFire).not.toHaveBeenCalled()
  })

  it('saisir une dépense cible calcule et affiche le résultat FIRE', async () => {
    render(<SimulateurPage />)
    await waitFor(() => expect(api.getSimulation).toHaveBeenCalledTimes(1))

    fireEvent.change(screen.getByLabelText('Dépense annuelle cible (€)'), { target: { value: '30000' } })

    await waitFor(() =>
      expect(api.getFire).toHaveBeenCalledWith({
        rendement_annuel_pct: 5,
        epargne_mensuelle: 0,
        depense_annuelle_cible: 30000,
        taux_retrait_pct: 4,
      }),
    )
    expect(await screen.findByText('1 000 000 €')).toBeInTheDocument()
    expect(screen.getByText('Dans 25.4 ans')).toBeInTheDocument()
  })

  it('indépendance déjà atteinte affiche "Déjà atteinte"', async () => {
    vi.mocked(api.getFire).mockResolvedValue(fireResult({ annees_avant_independance: 0 }))
    render(<SimulateurPage />)
    fireEvent.change(screen.getByLabelText('Dépense annuelle cible (€)'), { target: { value: '30000' } })

    expect(await screen.findByText('Déjà atteinte')).toBeInTheDocument()
  })

  it('indépendance non atteinte dans l\'horizon affiche un message explicite', async () => {
    vi.mocked(api.getFire).mockResolvedValue(fireResult({ annees_avant_independance: null }))
    render(<SimulateurPage />)
    fireEvent.change(screen.getByLabelText('Dépense annuelle cible (€)'), { target: { value: '30000' } })

    expect(await screen.findByText('Non atteinte (60 ans)')).toBeInTheDocument()
  })

  it('une erreur API affiche le message sans faire planter la page', async () => {
    vi.mocked(api.getSimulation).mockRejectedValue(new Error('panne simulée'))
    render(<SimulateurPage />)

    await screen.findByText('panne simulée')
  })
})
