import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../api/client'
import type { AnalysisResponse, ExpositionConsolidee } from '../api/types'
import DashboardPage from './DashboardPage'

vi.mock('../api/client', () => ({
  api: {
    getAnalysis: vi.fn(),
    getPerformance: vi.fn(),
    getCoutGestionConsolide: vi.fn(),
    getExpositionConsolidee: vi.fn(),
    // Historique du portefeuille (backlog 2.K.6) : remonté ici pour être partagé avec
    // `PortfolioHistoryChart`/`PatrimoineNetCard` (tous deux mis de côté ci-dessous) —
    // hors de l'objet de ce fichier, stub neutre.
    getPortfolioHistory: vi.fn().mockResolvedValue({ points: [] }),
    // Historique combiné patrimoine (feature Net/Brut/Financier sur toute la page
    // Synthèse) : même philosophie que ci-dessus, stub neutre.
    getPatrimoineHistory: vi.fn().mockResolvedValue({ points: [] }),
  },
}))

// Composants lourds (recharts, appels réseau propres) mis de côté : ce fichier ne
// verrouille pas leur rendu interne (déjà couvert ailleurs, ex. `AllocationChartCard.test.tsx`).
vi.mock('../components/PortfolioHistoryChart', () => ({ default: () => <div /> }))
vi.mock('../components/AllocationBarChart', () => ({ default: () => <div /> }))
vi.mock('../components/CompositionModal', () => ({ default: () => <div /> }))
vi.mock('../components/PerformanceCard', () => ({ default: () => <div /> }))
vi.mock('../components/MetriquesAvanceesCard', () => ({ default: () => <div /> }))
vi.mock('../components/RevenusPassifsCard', () => ({ default: () => <div /> }))
vi.mock('../components/QualiteDonneesCard', () => ({ default: () => <div /> }))
vi.mock('../components/CoutGestionCard', () => ({ default: () => <div /> }))
// Patrimoine net (roadmap Phase 1) : carte autonome avec son propre appel API, hors
// de l'objet de ce fichier — testée séparément dans PatrimoineNetCard.test.tsx.
vi.mock('../components/PatrimoineNetCard', () => ({ default: () => <div /> }))

// Contrôles transverses (backlog 2.K.3) : `DashboardPage` lit
// `usePreferencesAffichage()` (montants masqués) — non testé ici, stub neutre.
vi.mock('../hooks/usePreferencesAffichage', () => ({
  usePreferencesAffichage: () => ({ lentille: 'net', setLentille: vi.fn(), montantsMasques: false, toggleMontantsMasques: vi.fn(), detenteurId: null, setDetenteurId: vi.fn() }),
}))

function analyse(overrides: Partial<AnalysisResponse> = {}): AnalysisResponse {
  return {
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

function expositionConsolidee(overrides: Partial<ExpositionConsolidee> = {}): ExpositionConsolidee {
  return {
    valeur_totale: 0,
    repartition_geo: [],
    repartition_classe: [],
    plus_grosse_ligne_ticker: null,
    plus_grosse_ligne_pct: null,
    top5_lignes_pct: null,
    premiere_zone_geo: null,
    premiere_zone_geo_pct: null,
    part_estimee_manuelle_pct: 0,
    valeur_totale_nette: 0,
    repartition_geo_nette: [],
    repartition_classe_nette: [],
    plus_grosse_ligne_ticker_nette: null,
    plus_grosse_ligne_pct_nette: null,
    top5_lignes_pct_nette: null,
    premiere_zone_geo_nette: null,
    premiere_zone_geo_pct_nette: null,
    part_estimee_manuelle_pct_nette: 0,
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

function mockReponsesParDefaut() {
  vi.mocked(api.getAnalysis).mockResolvedValue(analyse())
  vi.mocked(api.getPerformance).mockResolvedValue(null as never)
  vi.mocked(api.getCoutGestionConsolide).mockResolvedValue({
    valeur_fonds: 0,
    valeur_fonds_avec_ter_connu: 0,
    couverture_pct: 0,
    cout_annuel_estime: 0,
  })
  vi.mocked(api.getExpositionConsolidee).mockResolvedValue(expositionConsolidee())
}

describe('DashboardPage — chargement et actualisation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockReponsesParDefaut()
  })

  it("charge l'analyse au montage", async () => {
    renderPage()

    await waitFor(() => expect(api.getAnalysis).toHaveBeenCalledTimes(1))
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

  it("l'en-tête (bouton Actualiser) reste affiché pendant une erreur de chargement", async () => {
    vi.mocked(api.getAnalysis).mockRejectedValue(new Error('panne simulée'))
    renderPage()

    // Message brut (backlog 2.K.1, `EtatErreur`) : le préfixe "Erreur: " a été retiré,
    // normalisé comme partout ailleurs dans l'application.
    await screen.findByText('panne simulée')
    expect(screen.getByRole('button', { name: /Actualiser/ })).toBeInTheDocument()
  })
})

describe('DashboardPage — erreurs indépendantes de performance/comptes/coût de gestion (backlog 2.K.5)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockReponsesParDefaut()
  })

  it("un échec de getPerformance seul n'empêche pas le reste du tableau de bord de s'afficher, et Réessayer relance seulement cet appel", async () => {
    vi.mocked(api.getPerformance).mockRejectedValueOnce(new Error('panne performance'))
    const { fireEvent } = await import('@testing-library/react')
    renderPage()

    await screen.findByText('panne performance')
    // Le reste de la page (dépendant de `analysis`) s'affiche normalement.
    expect(await screen.findByText('Score de diversification')).toBeInTheDocument()

    vi.mocked(api.getPerformance).mockResolvedValueOnce(null as never)
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }))

    await waitFor(() => expect(api.getPerformance).toHaveBeenCalledTimes(2))
    expect(api.getAnalysis).toHaveBeenCalledTimes(1)
  })

  it('un échec de getCoutGestionConsolide affiche EtatErreur avec une action de reprise dédiée', async () => {
    vi.mocked(api.getCoutGestionConsolide).mockRejectedValueOnce(new Error('panne cout gestion'))
    const { fireEvent } = await import('@testing-library/react')
    renderPage()

    await screen.findByText('panne cout gestion')

    vi.mocked(api.getCoutGestionConsolide).mockResolvedValueOnce({
      valeur_fonds: 0,
      valeur_fonds_avec_ter_connu: 0,
      couverture_pct: 0,
      cout_annuel_estime: 0,
    })
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }))

    await waitFor(() => expect(api.getCoutGestionConsolide).toHaveBeenCalledTimes(2))
  })

})

describe('DashboardPage — hiérarchie de lecture (backlog 2.K.6)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockReponsesParDefaut()
  })

  it('charge un seul historique de portefeuille, partagé entre le chiffre et la courbe', async () => {
    renderPage()

    await screen.findByText('Score de diversification')
    expect(api.getPortfolioHistory).toHaveBeenCalledTimes(1)
  })

  it('charge aussi l\'historique combiné patrimoine (feature Net/Brut/Financier), scopé par détenteur', async () => {
    renderPage()

    await screen.findByText('Score de diversification')
    expect(api.getPatrimoineHistory).toHaveBeenCalledWith(null)
  })

  it('le détail (répartition, score de diversification, exposition consolidée...) est ouvert par défaut, et se replie au clic', async () => {
    const { fireEvent } = await import('@testing-library/react')
    renderPage()

    await screen.findByText('Score de diversification')
    // Exposition consolidée (backlog 2.P.1) — relocalisée depuis l'ancien écran
    // Analyse (retiré 25/08/2026) dans le détail repliable du Tableau de bord.
    expect(await screen.findByText('Exposition consolidée — tous actifs')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Détail' }))

    expect(screen.queryByText('Score de diversification')).not.toBeInTheDocument()
    expect(screen.queryByText('Exposition consolidée — tous actifs')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Actualiser/ })).toBeInTheDocument()
  })
})
