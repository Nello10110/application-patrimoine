import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { api } from '../api/client'
import type { PatrimoineNet } from '../api/types'
import PatrimoineNetCard from './PatrimoineNetCard'

vi.mock('../api/client', () => ({
  api: {
    getPatrimoineNet: vi.fn(),
  },
}))

function patrimoine(overrides: Partial<PatrimoineNet> = {}): PatrimoineNet {
  return {
    actifs_totaux: 0,
    passifs_totaux: 0,
    patrimoine_net: 0,
    repartition_par_classe: [],
    ...overrides,
  }
}

describe('PatrimoineNetCard', () => {
  it("n'affiche rien tant qu'aucun actif ni passif n'est enregistré", async () => {
    vi.mocked(api.getPatrimoineNet).mockResolvedValue(patrimoine())
    const { container } = render(<PatrimoineNetCard />)

    await vi.waitFor(() => expect(api.getPatrimoineNet).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })

  it("n'affiche rien si l'appel API échoue", async () => {
    vi.mocked(api.getPatrimoineNet).mockRejectedValue(new Error('panne simulée'))
    const { container } = render(<PatrimoineNetCard />)

    await vi.waitFor(() => expect(api.getPatrimoineNet).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })

  it('affiche les actifs, passifs et le patrimoine net', async () => {
    vi.mocked(api.getPatrimoineNet).mockResolvedValue(
      patrimoine({ actifs_totaux: 300000, passifs_totaux: 120000, patrimoine_net: 180000 }),
    )
    render(<PatrimoineNetCard />)

    await screen.findByText('300 000 €')
    expect(screen.getByText('120 000 €')).toBeInTheDocument()
    expect(screen.getByText('180 000 €')).toBeInTheDocument()
  })

  it('affiche la répartition par classe quand renseignée', async () => {
    vi.mocked(api.getPatrimoineNet).mockResolvedValue(
      patrimoine({
        actifs_totaux: 300000,
        patrimoine_net: 300000,
        repartition_par_classe: [
          { categorie: 'Immobilier', valeur: 250000 },
          { categorie: 'Actions', valeur: 50000 },
        ],
      }),
    )
    render(<PatrimoineNetCard />)

    await screen.findByText('Immobilier')
    expect(screen.getByText('Actions')).toBeInTheDocument()
  })
})
