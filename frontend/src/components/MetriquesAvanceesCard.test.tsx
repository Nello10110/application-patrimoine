import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { api } from '../api/client'
import type { ComparaisonBenchmark, MetriquesAvancees } from '../api/types'
import MetriquesAvanceesCard from './MetriquesAvanceesCard'

vi.mock('../api/client', () => ({
  api: {
    getMetriquesAvancees: vi.fn(),
    listBenchmarks: vi.fn(),
    getComparaisonBenchmark: vi.fn(),
  },
}))

function metriques(overrides: Partial<MetriquesAvancees> = {}): MetriquesAvancees {
  return {
    twr_cumule_pct: 12.5,
    twr_annualise_pct: 8.2,
    volatilite_annualisee_pct: 15.0,
    max_drawdown_pct: -10.0,
    drawdown_recupere: true,
    semaines_recuperation: 3,
    ...overrides,
  }
}

describe('MetriquesAvanceesCard', () => {
  it('affiche un état vide quand l’historique est insuffisant', async () => {
    vi.mocked(api.getMetriquesAvancees).mockResolvedValue(
      metriques({ twr_cumule_pct: null, twr_annualise_pct: null, volatilite_annualisee_pct: null, max_drawdown_pct: null, drawdown_recupere: null, semaines_recuperation: null }),
    )
    vi.mocked(api.listBenchmarks).mockResolvedValue([])

    render(<MetriquesAvanceesCard />)

    await screen.findByText('Historique insuffisant pour calculer ces métriques.')
  })

  it('affiche le TWR, la volatilité et le max drawdown avec la récupération', async () => {
    vi.mocked(api.getMetriquesAvancees).mockResolvedValue(metriques())
    vi.mocked(api.listBenchmarks).mockResolvedValue([])

    render(<MetriquesAvanceesCard />)

    await screen.findByText('+12.5%')
    expect(screen.getByText('+8.2%')).toBeInTheDocument()
    expect(screen.getByText('15%')).toBeInTheDocument()
    expect(screen.getByText('-10%')).toBeInTheDocument()
    expect(screen.getByText('récupéré en 3 semaines')).toBeInTheDocument()
  })

  it('n’affiche pas de mention de récupération quand il n’y a jamais eu de drawdown', async () => {
    vi.mocked(api.getMetriquesAvancees).mockResolvedValue(metriques({ max_drawdown_pct: 0, drawdown_recupere: true, semaines_recuperation: null }))
    vi.mocked(api.listBenchmarks).mockResolvedValue([])

    render(<MetriquesAvanceesCard />)

    await screen.findByText('+12.5%')
    expect(screen.queryByText(/récupéré/)).not.toBeInTheDocument()
  })

  it('affiche "non récupéré à ce jour" quand le drawdown persiste', async () => {
    vi.mocked(api.getMetriquesAvancees).mockResolvedValue(metriques({ drawdown_recupere: false, semaines_recuperation: null }))
    vi.mocked(api.listBenchmarks).mockResolvedValue([])

    render(<MetriquesAvanceesCard />)

    await screen.findByText('non récupéré à ce jour')
  })

  it('charge la comparaison au choix d’un indice', async () => {
    vi.mocked(api.getMetriquesAvancees).mockResolvedValue(metriques())
    vi.mocked(api.listBenchmarks).mockResolvedValue([{ key: 'MSCI_WORLD', label: 'MSCI World' }])
    const comparaison: ComparaisonBenchmark = {
      benchmark_key: 'MSCI_WORLD',
      label: 'MSCI World',
      points: [
        { date: '2024-01-01', portefeuille_pct: 0, benchmark_pct: 0 },
        { date: '2024-01-08', portefeuille_pct: 5, benchmark_pct: 3 },
      ],
    }
    vi.mocked(api.getComparaisonBenchmark).mockResolvedValue(comparaison)

    render(<MetriquesAvanceesCard />)
    await screen.findByText('+12.5%')

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'MSCI_WORLD' } })

    await vi.waitFor(() => expect(api.getComparaisonBenchmark).toHaveBeenCalledWith('MSCI_WORLD'))
  })

  it('affiche une erreur avec bouton Réessayer si le chargement échoue', async () => {
    vi.mocked(api.getMetriquesAvancees).mockRejectedValueOnce(new Error('panne simulée'))
    render(<MetriquesAvanceesCard />)

    await screen.findByText('panne simulée')

    vi.mocked(api.getMetriquesAvancees).mockResolvedValueOnce(metriques())
    vi.mocked(api.listBenchmarks).mockResolvedValueOnce([])
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }))

    await screen.findByText('+12.5%')
  })
})
