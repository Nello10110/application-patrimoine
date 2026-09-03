import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { AuthContext, type AuthContextValue } from '../contexts/authContextObject'
import Sidebar from './Sidebar'

const utilisateurFactice: AuthContextValue = {
  user: { id: 1, username: 'testeur', role: 'proprietaire', onboarding_termine: true, holdings_sans_compte: 0 },
  loading: false,
  login: async () => {},
  register: async () => {},
  logout: () => {},
  completeOnboarding: async () => {},
  refetchUser: async () => {},
}

function renderSidebar(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthContext.Provider value={utilisateurFactice}>
        <Sidebar />
      </AuthContext.Provider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  localStorage.clear()
})

describe('Sidebar (backlog 2.K.2)', () => {
  it('affiche les écrans de consultation avec leur URL', () => {
    renderSidebar()
    expect(screen.getByRole('link', { name: /Synthèse/ })).toHaveAttribute('href', '/')
    expect(screen.getByRole('link', { name: /^Patrimoine$/ })).toHaveAttribute('href', '/patrimoine')
    expect(screen.getByRole('link', { name: /Objectifs/ })).toHaveAttribute('href', '/objectifs')
    expect(screen.getByRole('link', { name: /Comptes/ })).toHaveAttribute('href', '/comptes')
    expect(screen.getByRole('link', { name: /Dividendes/ })).toHaveAttribute('href', '/dividendes')
    expect(screen.getByRole('link', { name: /Rapport/ })).toHaveAttribute('href', '/rapport')
  })

  it("n'affiche pas les écrans d'administration", () => {
    renderSidebar()
    expect(screen.queryByRole('link', { name: /^Import$/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /^Réglages$/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /^Aide$/ })).not.toBeInTheDocument()
  })

  it('marque comme actif le lien correspondant à la route courante', () => {
    renderSidebar('/patrimoine')
    expect(screen.getByRole('link', { name: /^Patrimoine$/ })).toHaveClass('bg-texte')
    expect(screen.getByRole('link', { name: /Synthèse/ })).not.toHaveClass('bg-texte')
  })

  it("replie et déplie la barre latérale, et retient l'état après remontage (localStorage)", () => {
    const { unmount } = renderSidebar()
    expect(screen.getByRole('button', { name: 'Replier la barre latérale' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Replier la barre latérale' }))

    expect(screen.getByRole('button', { name: 'Déplier la barre latérale' })).toBeInTheDocument()
    expect(localStorage.getItem('patrimoine:sidebar-repliee')).toBe('1')

    unmount()
    renderSidebar()
    expect(screen.getByRole('button', { name: 'Déplier la barre latérale' })).toBeInTheDocument()
  })
})
