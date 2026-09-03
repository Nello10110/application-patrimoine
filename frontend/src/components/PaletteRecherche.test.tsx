import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../api/client'
import type { Holding, Loan } from '../api/types'
import { AuthContext, type AuthContextValue } from '../contexts/authContextObject'
import PaletteRecherche from './PaletteRecherche'

vi.mock('../api/client', () => ({
  api: {
    listHoldings: vi.fn().mockResolvedValue([]),
    listLoans: vi.fn().mockResolvedValue([]),
  },
}))

const utilisateurFactice: AuthContextValue = {
  user: { id: 1, username: 'testeur', role: 'proprietaire', onboarding_termine: true, holdings_sans_compte: 0 },
  loading: false,
  login: async () => {},
  register: async () => {},
  logout: () => {},
  completeOnboarding: async () => {},
  refetchUser: async () => {},
}

function EcranCourant() {
  return (
    <Routes>
      <Route path="/" element={<p>Accueil</p>} />
      <Route path="/patrimoine" element={<p>Écran patrimoine</p>} />
      <Route path="/patrimoine/:ticker" element={<p>Écran fiche détaillée</p>} />
    </Routes>
  )
}

function renderPalette() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <AuthContext.Provider value={utilisateurFactice}>
        <PaletteRecherche />
        <EcranCourant />
      </AuthContext.Provider>
    </MemoryRouter>,
  )
}

function holding(overrides: Partial<Holding> = {}): Holding {
  return {
    id: 1,
    ticker: 'AAPL',
    nom: 'Apple',
    quantite: 1,
    prix_revient_moyen: 100,
    compte: null,
    devise: 'EUR',
    type_actif: 'STOCK',
    origine: 'manuel',
    created_at: '2024-01-01T00:00:00',
    updated_at: '2024-01-01T00:00:00',
    market_data: null,
    rendement_depuis_achat_pct: null,
    rendement_annualise_pct: null,
    valeur: 100,
    valeur_estimee: null,
    date_valeur_estimee: null,
    taux_pct: null,
    zone_geo: null,
    versement_mensuel: null,
    date_acquisition: null,
    ...overrides,
  }
}

function loan(overrides: Partial<Loan> = {}): Loan {
  return {
    id: 1,
    libelle: 'Crédit immobilier',
    capital_initial: 200000,
    taux_annuel_pct: 3.5,
    mensualite: 1200,
    date_debut: '2020-01-01T00:00:00',
    duree_mois: 240,
    capital_restant_du_manuel: null,
    derniere_maj_manuelle: null,
    capital_restant_du: 150000,
    holding_id: null,
    etablissement_id: null,
    created_at: '2020-01-01T00:00:00',
    updated_at: '2020-01-01T00:00:00',
    ...overrides,
  }
}

beforeEach(() => {
  vi.mocked(api.listHoldings).mockResolvedValue([])
  vi.mocked(api.listLoans).mockResolvedValue([])
})

describe('PaletteRecherche (backlog 2.K.2)', () => {
  it('fermée par défaut, un clic sur le bouton l\'ouvre', () => {
    renderPalette()
    expect(screen.queryByPlaceholderText(/Un écran, une position/)).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Recherche/ }))

    expect(screen.getByPlaceholderText(/Un écran, une position/)).toBeInTheDocument()
  })

  it('Ctrl+K ouvre la palette, Échap la referme', () => {
    renderPalette()

    fireEvent.keyDown(document, { key: 'k', ctrlKey: true })
    expect(screen.getByPlaceholderText(/Un écran, une position/)).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByPlaceholderText(/Un écran, une position/)).not.toBeInTheDocument()
  })

  it('Ctrl+K est ignoré si le focus est sur un champ de saisie externe', () => {
    render(
      <MemoryRouter>
        <AuthContext.Provider value={utilisateurFactice}>
          <input aria-label="champ externe" />
          <PaletteRecherche />
        </AuthContext.Provider>
      </MemoryRouter>,
    )
    screen.getByLabelText('champ externe').focus()

    fireEvent.keyDown(document, { key: 'k', ctrlKey: true })

    expect(screen.queryByPlaceholderText(/Un écran, une position/)).not.toBeInTheDocument()
  })

  it('liste les écrans de consultation par défaut (champ vide)', () => {
    renderPalette()
    fireEvent.click(screen.getByRole('button', { name: /Recherche/ }))

    expect(screen.getByText('Synthèse')).toBeInTheDocument()
    expect(screen.getByText('Patrimoine')).toBeInTheDocument()
  })

  it('filtre les positions par ticker ou nom, insensible à la casse', async () => {
    vi.mocked(api.listHoldings).mockResolvedValue([holding({ ticker: 'AAPL', nom: 'Apple' }), holding({ id: 2, ticker: 'MSFT', nom: 'Microsoft' })])
    renderPalette()
    fireEvent.click(screen.getByRole('button', { name: /Recherche/ }))
    await waitFor(() => expect(api.listHoldings).toHaveBeenCalled())

    fireEvent.change(screen.getByPlaceholderText(/Un écran, une position/), { target: { value: 'apple' } })

    expect(screen.getByText('AAPL')).toBeInTheDocument()
    expect(screen.queryByText('MSFT')).not.toBeInTheDocument()
  })

  it('cliquer un résultat "position" navigue vers sa fiche et ferme la palette', async () => {
    vi.mocked(api.listHoldings).mockResolvedValue([holding({ ticker: 'AAPL', nom: 'Apple' })])
    renderPalette()
    fireEvent.click(screen.getByRole('button', { name: /Recherche/ }))
    await screen.findByText('AAPL')

    fireEvent.click(screen.getByText('AAPL'))

    await screen.findByText('Écran fiche détaillée')
    expect(screen.queryByPlaceholderText(/Un écran, une position/)).not.toBeInTheDocument()
  })

  it('liste les emprunts par libellé', async () => {
    vi.mocked(api.listLoans).mockResolvedValue([loan({ libelle: 'Crédit immobilier' })])
    renderPalette()
    fireEvent.click(screen.getByRole('button', { name: /Recherche/ }))

    await screen.findByText('Crédit immobilier')
  })

  it("Entrée ouvre le résultat actif", async () => {
    vi.mocked(api.listHoldings).mockResolvedValue([holding({ ticker: 'AAPL', nom: 'Apple' })])
    renderPalette()
    fireEvent.click(screen.getByRole('button', { name: /Recherche/ }))
    await screen.findByText('AAPL')

    fireEvent.change(screen.getByPlaceholderText(/Un écran, une position/), { target: { value: 'AAPL' } })
    fireEvent.keyDown(screen.getByPlaceholderText(/Un écran, une position/), { key: 'Enter' })

    await screen.findByText('Écran fiche détaillée')
  })
})
