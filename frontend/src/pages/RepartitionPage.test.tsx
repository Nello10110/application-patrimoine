import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../api/client'
import type { AnalysisResponse } from '../api/types'
import RepartitionPage from './RepartitionPage'

vi.mock('../api/client', () => ({
  api: {
    getTargets: vi.fn(),
    getDefaultTargets: vi.fn(),
    setTargets: vi.fn(),
    listTargetYears: vi.fn(),
    getAnalysis: vi.fn(),
  },
}))

const CURRENT_YEAR = new Date().getFullYear()

const DEFAUTS = {
  geo: [{ categorie: 'Europe', pourcentage_cible: 100 }],
  sector: [{ categorie: 'Santé', pourcentage_cible: 100 }],
}

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

describe('RepartitionPage — objectifs (échec de chargement)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.getDefaultTargets).mockResolvedValue(DEFAUTS)
    vi.mocked(api.listTargetYears).mockResolvedValue([])
    vi.mocked(api.getAnalysis).mockResolvedValue(analyse())
  })

  it('affiche le motif de l’échec au lieu de deux éditeurs vides et silencieux', async () => {
    vi.mocked(api.getTargets).mockRejectedValue(new Error('Connexion au serveur impossible'))

    render(<RepartitionPage />)

    await waitFor(() => expect(screen.getByText(/Connexion au serveur impossible/)).toBeInTheDocument())
  })

  it('désactive « Enregistrer » tant que le chargement a échoué', async () => {
    // Sans ce garde-fou, un clic sur Enregistrer écraserait les objectifs réellement
    // enregistrés par la répartition vide affichée à l’écran.
    vi.mocked(api.getTargets).mockRejectedValue(new Error('Connexion au serveur impossible'))

    render(<RepartitionPage />)

    await waitFor(() => expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeDisabled())
    expect(api.setTargets).not.toHaveBeenCalled()
  })

  it('recharge les objectifs au clic sur « Réessayer »', async () => {
    vi.mocked(api.getTargets)
      .mockRejectedValueOnce(new Error('Connexion au serveur impossible'))
      .mockResolvedValueOnce([{ id: 1, annee: CURRENT_YEAR, type: 'geo', categorie: 'Japon', pourcentage_cible: 100 }])

    render(<RepartitionPage />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Réessayer' })).toBeInTheDocument())

    await userEvent.click(screen.getByRole('button', { name: 'Réessayer' }))

    await waitFor(() => expect(screen.getByText('Japon')).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: 'Réessayer' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeEnabled()
  })

  it('charge normalement quand l’API répond', async () => {
    vi.mocked(api.getTargets).mockResolvedValue([{ id: 1, annee: CURRENT_YEAR, type: 'sector', categorie: 'Énergie', pourcentage_cible: 100 }])

    render(<RepartitionPage />)

    await waitFor(() => expect(screen.getByText('Énergie')).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: 'Réessayer' })).not.toBeInTheDocument()
  })
})

describe('RepartitionPage — rééquilibrage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.getTargets).mockResolvedValue([])
    vi.mocked(api.getDefaultTargets).mockResolvedValue(DEFAUTS)
    vi.mocked(api.listTargetYears).mockResolvedValue([CURRENT_YEAR - 1])
  })

  it('affiche les alertes et les recommandations complètes', async () => {
    vi.mocked(api.getAnalysis).mockResolvedValue(
      analyse({
        recommandations: [{ type: 'geo', categorie: 'Europe', ecart_pourcentage: 8.0, montant_a_ajuster: 100, sens: 'reduire' }],
        alertes: [{ type: 'geo', categorie: 'Europe', ecart_pourcentage: 8.0, montant_a_ajuster: 100, sens: 'reduire' }],
      }),
    )

    render(<RepartitionPage />)

    await screen.findByText(/1 alerte de rééquilibrage/)
    expect(screen.getByText(/Réduire de/)).toBeInTheDocument()
  })

  it("indique un portefeuille aligné sans alerte ni recommandation", async () => {
    vi.mocked(api.getAnalysis).mockResolvedValue(
      analyse({ geo: [{ categorie: 'Europe', valeur: 1000, pourcentage_reel: 100, pourcentage_cible: 100, ecart: 0 }] }),
    )

    render(<RepartitionPage />)

    await waitFor(() => expect(api.getAnalysis).toHaveBeenCalled())
    expect(screen.queryByText(/alerte de rééquilibrage/)).not.toBeInTheDocument()
    expect(screen.getByText(/Portefeuille bien aligné/)).toBeInTheDocument()
  })

  it("recharge l'analyse (et les objectifs) quand l'année sélectionnée change", async () => {
    vi.mocked(api.getAnalysis).mockResolvedValue(analyse())
    render(<RepartitionPage />)
    await waitFor(() => expect(api.getAnalysis).toHaveBeenCalledWith(CURRENT_YEAR))

    const select = await screen.findByRole('combobox')
    const { fireEvent } = await import('@testing-library/react')
    fireEvent.change(select, { target: { value: String(CURRENT_YEAR - 1) } })

    await waitFor(() => expect(api.getAnalysis).toHaveBeenCalledWith(CURRENT_YEAR - 1))
    await waitFor(() => expect(api.getTargets).toHaveBeenCalledWith(CURRENT_YEAR - 1))
  })

  it('recharge le rééquilibrage après un enregistrement réussi des objectifs', async () => {
    vi.mocked(api.getAnalysis).mockResolvedValue(analyse())
    vi.mocked(api.setTargets).mockResolvedValue([])
    render(<RepartitionPage />)
    await waitFor(() => expect(api.getAnalysis).toHaveBeenCalledTimes(1))

    await userEvent.click(await screen.findByRole('button', { name: 'Enregistrer' }))

    await waitFor(() => expect(api.setTargets).toHaveBeenCalled())
    await waitFor(() => expect(api.getAnalysis).toHaveBeenCalledTimes(2))
  })
})
