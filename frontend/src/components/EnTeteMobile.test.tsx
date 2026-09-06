import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../api/client'
import type { Detenteur } from '../api/types'
import { AuthContext, type AuthContextValue } from '../contexts/authContextObject'
import { PreferencesAffichageProvider } from '../contexts/PreferencesAffichageContext'
import EnTeteMobile from './EnTeteMobile'

vi.mock('../api/client', () => ({
  api: {
    listDetenteurs: vi.fn().mockResolvedValue([]),
  },
}))

function auth(overrides: Partial<AuthContextValue['user']> = {}): AuthContextValue {
  return {
    user: { id: 1, username: 'paul', role: 'proprietaire', onboarding_termine: true, holdings_sans_compte: 0, ...overrides },
    loading: false,
    login: async () => {},
    register: async () => {},
    logout: () => {},
    completeOnboarding: async () => {},
    refetchUser: async () => {},
  }
}

function detenteur(overrides: Partial<Detenteur> = {}): Detenteur {
  return { id: 1, nom: 'Alice', type: 'personne', created_at: '2026-01-01T00:00:00', updated_at: '2026-01-01T00:00:00', ...overrides }
}

function renderEnTete(path = '/', valeurAuth = auth()) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthContext.Provider value={valeurAuth}>
        <PreferencesAffichageProvider>
          <EnTeteMobile />
        </PreferencesAffichageProvider>
      </AuthContext.Provider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  localStorage.clear()
  vi.mocked(api.listDetenteurs).mockResolvedValue([])
})

describe('EnTeteMobile (refonte « liquid glass », en-tête < 768 px)', () => {
  it("affiche le titre de l'écran courant et la ligne de contexte par défaut", () => {
    renderEnTete('/budget')

    expect(screen.getByRole('heading', { level: 1, name: 'Budget' })).toBeInTheDocument()
    expect(screen.getByText(/Foyer · vue nette/)).toBeInTheDocument()
  })

  it("résout aussi une route paramétrée (fiche d'une position)", () => {
    renderEnTete('/patrimoine/AAPL')
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
  })

  it('le bouton œil bascule le masquage des montants', () => {
    renderEnTete()
    fireEvent.click(screen.getByRole('button', { name: 'Masquer les montants' }))

    expect(screen.getByRole('button', { name: 'Afficher les montants' })).toHaveAttribute('aria-pressed', 'true')
  })

  it("la ligne de contexte ouvre la feuille de réglages et y change la lentille", () => {
    renderEnTete()
    fireEvent.click(screen.getByText(/Foyer · vue nette/))

    fireEvent.click(screen.getByRole('button', { name: 'Brut' }))

    expect(localStorage.getItem('patrimoine:lentille')).toBe('brut')
    expect(screen.getByText(/Foyer · vue brute/)).toBeInTheDocument()
  })

  it('la feuille expose le détenteur, et la ligne de contexte reflète le choix', async () => {
    vi.mocked(api.listDetenteurs).mockResolvedValue([detenteur({ id: 7, nom: 'Alice' })])
    renderEnTete()

    fireEvent.click(screen.getByRole('button', { name: "Réglages d'affichage" }))
    const select = await screen.findByLabelText('Détenteur')
    fireEvent.change(select, { target: { value: '7' } })

    expect(localStorage.getItem('patrimoine:detenteur-id')).toBe('7')
    expect(screen.getByText(/Alice · vue nette/)).toBeInTheDocument()
  })
})
