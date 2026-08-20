import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../api/client'
import type { AnalysisResponse } from '../api/types'
import RecommandationsPage from './RecommandationsPage'

vi.mock('../api/client', () => ({
  api: {
    listTargetYears: vi.fn(),
    getAnalysis: vi.fn(),
  },
}))

const CURRENT_YEAR = new Date().getFullYear()

function analyse(overrides: Partial<AnalysisResponse> = {}): AnalysisResponse {
  return {
    annee: CURRENT_YEAR,
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
      <RecommandationsPage />
    </MemoryRouter>,
  )
}

describe('RecommandationsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.listTargetYears).mockResolvedValue([CURRENT_YEAR - 1])
  })

  it('affiche les alertes et les recommandations complètes', async () => {
    vi.mocked(api.getAnalysis).mockResolvedValue(
      analyse({
        recommandations: [{ type: 'geo', categorie: 'Europe', ecart_pourcentage: 8.0, montant_a_ajuster: 100, sens: 'reduire' }],
        alertes: [{ type: 'geo', categorie: 'Europe', ecart_pourcentage: 8.0, montant_a_ajuster: 100, sens: 'reduire' }],
      }),
    )

    renderPage()

    await screen.findByText(/1 alerte de rééquilibrage/)
    expect(screen.getAllByText('Europe').length).toBe(2) // une fois dans les alertes, une fois dans les recommandations
    expect(screen.getByText(/Réduire de/)).toBeInTheDocument()
  })

  it("indique un portefeuille aligné sans alerte ni recommandation", async () => {
    vi.mocked(api.getAnalysis).mockResolvedValue(
      analyse({ geo: [{ categorie: 'Europe', valeur: 1000, pourcentage_reel: 100, pourcentage_cible: 100, ecart: 0 }] }),
    )

    renderPage()

    await waitFor(() => expect(api.getAnalysis).toHaveBeenCalled())
    expect(screen.queryByText(/alerte de rééquilibrage/)).not.toBeInTheDocument()
    expect(screen.getByText(/Portefeuille bien aligné/)).toBeInTheDocument()
  })

  it("recharge l'analyse quand l'année sélectionnée change", async () => {
    vi.mocked(api.getAnalysis).mockResolvedValue(analyse())
    renderPage()
    await waitFor(() => expect(api.getAnalysis).toHaveBeenCalledWith(CURRENT_YEAR))

    const select = await screen.findByRole('combobox')
    const { fireEvent } = await import('@testing-library/react')
    fireEvent.change(select, { target: { value: String(CURRENT_YEAR - 1) } })

    await waitFor(() => expect(api.getAnalysis).toHaveBeenCalledWith(CURRENT_YEAR - 1))
  })
})
