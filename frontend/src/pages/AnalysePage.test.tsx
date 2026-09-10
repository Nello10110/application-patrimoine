import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../api/client'
import type { AnalysisResponse, ExpositionConsolidee } from '../api/types'
import AnalysePage from './AnalysePage'

vi.mock('../api/client', () => ({
  api: {
    getAnalysis: vi.fn(),
    getPerformance: vi.fn(),
    getCoutGestionConsolide: vi.fn(),
    getExpositionConsolidee: vi.fn(),
    getDividendCalendar: vi.fn().mockResolvedValue([]),
  },
}))

// Composants lourds (recharts, appels réseau propres) mis de côté : ce fichier ne
// verrouille pas leur rendu interne (déjà couvert ailleurs, ex. `AllocationChartCard.test.tsx`).
vi.mock('../components/AllocationBarChart', () => ({ default: () => <div /> }))
vi.mock('../components/CompositionModal', () => ({ default: () => <div /> }))
vi.mock('../components/PerformanceCard', () => ({ default: () => <div /> }))
vi.mock('../components/MetriquesAvanceesCard', () => ({ default: () => <div /> }))
vi.mock('../components/RevenusPassifsCard', () => ({ default: () => <div /> }))
vi.mock('../components/QualiteDonneesCard', () => ({ default: () => <div /> }))
vi.mock('../components/CoutGestionCard', () => ({ default: () => <div /> }))
vi.mock('../components/SimulateurAchatLocationCard', () => ({ default: () => <div>SIMULATEUR_MOCK</div> }))

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

function renderPage(url = '/analyse') {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <AnalysePage />
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
  vi.mocked(api.getDividendCalendar).mockResolvedValue([])
}

beforeEach(() => {
  vi.clearAllMocks()
  mockReponsesParDefaut()
})

describe('AnalysePage — chargement et actualisation', () => {
  it("charge l'analyse au montage", async () => {
    renderPage()

    await waitFor(() => expect(api.getAnalysis).toHaveBeenCalledTimes(1))
  })

  it('le bouton Actualiser relance analyse et rentabilité', async () => {
    renderPage()
    await waitFor(() => expect(api.getAnalysis).toHaveBeenCalledTimes(1))
    expect(api.getPerformance).toHaveBeenCalledTimes(1)

    fireEvent.click(await screen.findByRole('button', { name: /Actualiser/ }))

    await waitFor(() => expect(api.getAnalysis).toHaveBeenCalledTimes(2))
    expect(api.getPerformance).toHaveBeenCalledTimes(2)
  })

  it("l'en-tête (bouton Actualiser) reste affiché pendant une erreur de chargement", async () => {
    vi.mocked(api.getAnalysis).mockRejectedValue(new Error('panne simulée'))
    renderPage()

    await screen.findByText('panne simulée')
    expect(screen.getByRole('button', { name: /Actualiser/ })).toBeInTheDocument()
  })
})

describe('AnalysePage — erreurs indépendantes de performance/coût de gestion (backlog 2.K.5)', () => {
  it("un échec de getPerformance seul n'empêche pas le reste de s'afficher, et Réessayer relance seulement cet appel", async () => {
    vi.mocked(api.getPerformance).mockRejectedValueOnce(new Error('panne performance'))
    renderPage()

    await screen.findByText('panne performance')
    expect(await screen.findByText('Score de diversification')).toBeInTheDocument()

    vi.mocked(api.getPerformance).mockResolvedValueOnce(null as never)
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }))

    await waitFor(() => expect(api.getPerformance).toHaveBeenCalledTimes(2))
    expect(api.getAnalysis).toHaveBeenCalledTimes(1)
  })

  it('un échec de getCoutGestionConsolide affiche EtatErreur avec une action de reprise dédiée', async () => {
    vi.mocked(api.getCoutGestionConsolide).mockRejectedValueOnce(new Error('panne cout gestion'))
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

describe('AnalysePage — onglet Achat vs location (simulateur résidence principale, 10/09/2026)', () => {
  it('bascule vers Achat vs location', async () => {
    renderPage()
    await screen.findByText('Score de diversification')

    fireEvent.click(screen.getByRole('tab', { name: /Achat vs location/ }))

    expect(screen.queryByText('Score de diversification')).not.toBeInTheDocument()
    expect(await screen.findByText('SIMULATEUR_MOCK')).toBeInTheDocument()
  })

  it("ouvre directement Achat vs location quand l'URL le demande", async () => {
    renderPage('/analyse?onglet=simulateur')

    expect(await screen.findByText('SIMULATEUR_MOCK')).toBeInTheDocument()
    expect(screen.queryByText('Score de diversification')).not.toBeInTheDocument()
  })
})

describe('AnalysePage — les deux onglets (réorganisation du 07/09/2026)', () => {
  it("ouvre l'onglet Portefeuille par défaut : risques, exposition, qualité des données", async () => {
    renderPage()

    expect(await screen.findByText('Score de diversification')).toBeInTheDocument()
    // Exposition consolidée (backlog 2.P.1), rapatriée du repli « Détail » du
    // tableau de bord.
    expect(await screen.findByText('Exposition consolidée — tous actifs')).toBeInTheDocument()
  })

  it("bascule vers Revenus, qui porte les dividendes de l'ancien écran dédié", async () => {
    renderPage()
    await screen.findByText('Score de diversification')

    fireEvent.click(screen.getByRole('tab', { name: /Revenus/ }))

    await waitFor(() => expect(api.getDividendCalendar).toHaveBeenCalled())
    expect(screen.queryByText('Score de diversification')).not.toBeInTheDocument()
    expect(await screen.findByText(/Aucun dividende perçu/)).toBeInTheDocument()
  })

  // L'onglet vit dans l'URL (même patron que `ReglagesPage`) : c'est ce qui rend
  // `/dividendes` -> `/analyse?onglet=revenus` possible sans perdre la destination.
  it("ouvre directement Revenus quand l'URL le demande", async () => {
    renderPage('/analyse?onglet=revenus')

    await waitFor(() => expect(api.getDividendCalendar).toHaveBeenCalled())
    expect(screen.queryByText('Score de diversification')).not.toBeInTheDocument()
  })
})
