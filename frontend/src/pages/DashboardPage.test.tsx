import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../api/client'
import DashboardPage from './DashboardPage'

vi.mock('../api/client', () => ({
  api: {
    // Historique du portefeuille (backlog 2.K.6) : remonté par la page pour être
    // partagé avec `PortfolioHistoryChart`/`PatrimoineNetCard` (tous deux mis de côté
    // ci-dessous) — un seul appel réseau pour les deux.
    getPortfolioHistory: vi.fn().mockResolvedValue({ points: [] }),
    // Historique combiné patrimoine (feature Net/Brut/Financier sur toute la page
    // Synthèse) : même philosophie que ci-dessus.
    getPatrimoineHistory: vi.fn().mockResolvedValue({ points: [] }),
    listHoldings: vi.fn().mockResolvedValue([]),
  },
}))

// Composants lourds (recharts, appels réseau propres) mis de côté : ce fichier ne
// verrouille pas leur rendu interne, couvert dans leurs propres fichiers.
vi.mock('../components/PortfolioHistoryChart', () => ({ default: () => <div /> }))
vi.mock('../components/PatrimoineNetCard', () => ({ default: () => <div /> }))

vi.mock('../hooks/usePreferencesAffichage', () => ({
  usePreferencesAffichage: () => ({ lentille: 'net', setLentille: vi.fn(), montantsMasques: false, toggleMontantsMasques: vi.fn(), detenteurId: null, setDetenteurId: vi.fn() }),
}))

function renderPage() {
  return render(
    <MemoryRouter>
      <DashboardPage />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(api.getPortfolioHistory).mockResolvedValue({ points: [] })
  vi.mocked(api.getPatrimoineHistory).mockResolvedValue({ points: [] })
  vi.mocked(api.listHoldings).mockResolvedValue([])
})

describe('DashboardPage — écran d\'accueil allégé (07/09/2026)', () => {
  it('charge un seul historique de portefeuille, partagé entre le chiffre et la courbe', async () => {
    renderPage()

    await waitFor(() => expect(api.getPortfolioHistory).toHaveBeenCalledTimes(1))
  })

  it("charge aussi l'historique combiné patrimoine (feature Net/Brut/Financier), scopé par détenteur", async () => {
    renderPage()

    await waitFor(() => expect(api.getPatrimoineHistory).toHaveBeenCalledWith(null))
  })

  // Le cœur de l'allègement demandé : ces trois appels coûteux ont suivi le contenu
  // qu'ils alimentaient vers l'écran Analyse. Ce test échouerait si l'un revenait ici
  // par mégarde — le mock d'`api` ne les expose même pas.
  it("n'appelle plus l'analyse, la rentabilité ni le coût de gestion", async () => {
    renderPage()

    await waitFor(() => expect(api.getPortfolioHistory).toHaveBeenCalled())
    expect(api).not.toHaveProperty('getAnalysis')
    expect(api).not.toHaveProperty('getPerformance')
    expect(api).not.toHaveProperty('getCoutGestionConsolide')
  })

  it('le bouton Actualiser relance les deux historiques', async () => {
    renderPage()
    await waitFor(() => expect(api.getPortfolioHistory).toHaveBeenCalledTimes(1))

    fireEvent.click(await screen.findByRole('button', { name: /Actualiser/ }))

    await waitFor(() => expect(api.getPortfolioHistory).toHaveBeenCalledTimes(2))
    expect(api.getPatrimoineHistory).toHaveBeenCalledTimes(2)
  })

  it("renvoie vers l'écran Analyse, où le détail a été déplacé", async () => {
    renderPage()

    const lien = await screen.findByRole('link', { name: /analyse détaillée/ })
    expect(lien).toHaveAttribute('href', '/analyse')
  })
})

describe('DashboardPage — invitation à importer (portefeuille vide)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.getPortfolioHistory).mockResolvedValue({ points: [] })
    vi.mocked(api.getPatrimoineHistory).mockResolvedValue({ points: [] })
  })

  it("propose d'importer quand aucune position n'existe", async () => {
    vi.mocked(api.listHoldings).mockResolvedValue([])
    renderPage()

    expect(await screen.findByText(/Aucune position dans le portefeuille/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /importer ton portefeuille/ })).toHaveAttribute('href', '/import')
  })

  it("ne propose rien dès qu'une position existe", async () => {
    vi.mocked(api.listHoldings).mockResolvedValue([{ id: 1 } as never])
    renderPage()

    await waitFor(() => expect(api.listHoldings).toHaveBeenCalled())
    expect(screen.queryByText(/Aucune position dans le portefeuille/)).not.toBeInTheDocument()
  })

  // Repli sûr : une panne réseau ne doit pas annoncer « aucune position » à quelqu'un
  // qui en a — l'absence d'encart est le seul état honnête quand on ne sait pas.
  it("n'annonce rien quand l'appel échoue", async () => {
    vi.mocked(api.listHoldings).mockRejectedValue(new Error('panne simulée'))
    renderPage()

    await waitFor(() => expect(api.listHoldings).toHaveBeenCalled())
    expect(screen.queryByText(/Aucune position dans le portefeuille/)).not.toBeInTheDocument()
  })
})
