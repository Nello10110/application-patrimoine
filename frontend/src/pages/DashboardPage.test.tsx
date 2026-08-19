import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../api/client'
import type { AnalysisResponse } from '../api/types'
import DashboardPage from './DashboardPage'

vi.mock('../api/client', () => ({
  api: {
    listTargetYears: vi.fn(),
    getAnalysis: vi.fn(),
    getPerformance: vi.fn(),
    getRepartitionComptes: vi.fn(),
  },
}))

// Composants lourds (recharts, appels réseau propres) mis de côté : ce fichier ne
// verrouille que le sélecteur d'année et le bouton "Actualiser" (LOT 5.3).
vi.mock('../components/PortfolioHistoryChart', () => ({ default: () => <div /> }))
vi.mock('../components/AllocationBarChart', () => ({ default: () => <div /> }))
vi.mock('../components/CompositionModal', () => ({ default: () => <div /> }))
vi.mock('../components/PerformanceCard', () => ({ default: () => <div /> }))
vi.mock('../components/QualiteDonneesCard', () => ({ default: () => <div /> }))

const CURRENT_YEAR = new Date().getFullYear()

function analyse(annee: number, overrides: Partial<AnalysisResponse> = {}): AnalysisResponse {
  return {
    annee,
    valeur_totale: 1000,
    geo: [],
    sector: [],
    risques: {
      valeur_totale: 1000,
      nombre_lignes: 1,
      top_ligne_poids: 10,
      top_ligne_nom: 'AAA',
      top_pays_poids: 10,
      top_pays_nom: 'France',
      top_secteur_poids: 10,
      top_secteur_nom: 'Tech',
      score_diversification: 80,
      lignes_sans_donnees: 0,
    },
    recommandations: [],
    alertes: [],
    qualite_donnees: {
      valeur_composition_reelle: 1000,
      pct_composition_reelle: 100,
      valeur_estimee_par_indice: 0,
      pct_estimee_par_indice: 0,
      valeur_non_categorisee: 0,
      pct_non_categorisee: 0,
      valeur_sans_cotation: 0,
      pct_sans_cotation: 0,
    },
    ...overrides,
  }
}

function renderPage() {
  return render(
    <MemoryRouter>
      <DashboardPage />
    </MemoryRouter>,
  )
}

describe('DashboardPage — sélecteur d\'année', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.listTargetYears).mockResolvedValue([2023, 2024])
    vi.mocked(api.getAnalysis).mockImplementation((annee: number) => Promise.resolve(analyse(annee)))
    vi.mocked(api.getPerformance).mockResolvedValue(null as never)
    vi.mocked(api.getRepartitionComptes).mockResolvedValue({
      valeur_totale: 0,
      items: [],
      a_des_comptes_annotes: false,
      pas_de_rentabilite_par_compte: '',
    })
  })

  it("charge l'analyse de l'année courante au montage, et propose les années enregistrées plus l'année courante", async () => {
    const anneeCourante = new Date().getFullYear()
    renderPage()

    await waitFor(() => expect(api.getAnalysis).toHaveBeenCalledWith(anneeCourante))

    const select = await screen.findByRole('combobox')
    const options = Array.from(select.querySelectorAll('option')).map((o) => o.textContent)
    expect(options).toContain('2023')
    expect(options).toContain('2024')
    expect(options).toContain(String(anneeCourante))
  })

  it("recharge l'analyse quand l'année sélectionnée change", async () => {
    renderPage()
    await waitFor(() => expect(api.getAnalysis).toHaveBeenCalled())
    vi.mocked(api.getAnalysis).mockClear()

    const select = await screen.findByRole('combobox')
    const { fireEvent } = await import('@testing-library/react')
    fireEvent.change(select, { target: { value: '2023' } })

    await waitFor(() => expect(api.getAnalysis).toHaveBeenCalledWith(2023))
  })

  it('le bouton Actualiser relance analyse et rentabilité', async () => {
    renderPage()
    await waitFor(() => expect(api.getAnalysis).toHaveBeenCalledTimes(1))
    expect(api.getPerformance).toHaveBeenCalledTimes(1)

    const { fireEvent } = await import('@testing-library/react')
    fireEvent.click(await screen.findByRole('button', { name: /Actualiser/ }))

    await waitFor(() => expect(api.getAnalysis).toHaveBeenCalledTimes(2))
    expect(api.getPerformance).toHaveBeenCalledTimes(2)
  })

  it("l'en-tête (sélecteur + bouton) reste affiché pendant une erreur de chargement", async () => {
    vi.mocked(api.getAnalysis).mockRejectedValue(new Error('panne simulée'))
    renderPage()

    await screen.findByText(/Erreur: panne simulée/)
    expect(screen.getByRole('combobox')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Actualiser/ })).toBeInTheDocument()
  })
})

describe('DashboardPage — bandeau d\'alerte (LOT 5.5)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.listTargetYears).mockResolvedValue([])
    vi.mocked(api.getPerformance).mockResolvedValue(null as never)
    vi.mocked(api.getRepartitionComptes).mockResolvedValue({
      valeur_totale: 0,
      items: [],
      a_des_comptes_annotes: false,
      pas_de_rentabilite_par_compte: '',
    })
  })

  it('affiche le bandeau ambre quand des alertes sont présentes', async () => {
    vi.mocked(api.getAnalysis).mockResolvedValue(
      analyse(CURRENT_YEAR, {
        alertes: [{ type: 'geo', categorie: 'Europe', ecart_pourcentage: 8.0, montant_a_ajuster: 100, sens: 'reduire' }],
      }),
    )
    renderPage()

    await screen.findByText(/1 alerte de rééquilibrage/)
    expect(screen.getByText('Europe')).toBeInTheDocument()
  })

  it("n'affiche aucun bandeau quand la liste d'alertes est vide", async () => {
    vi.mocked(api.getAnalysis).mockResolvedValue(analyse(CURRENT_YEAR))
    renderPage()

    await waitFor(() => expect(api.getAnalysis).toHaveBeenCalled())
    expect(screen.queryByText(/alerte de rééquilibrage/)).not.toBeInTheDocument()
  })
})
