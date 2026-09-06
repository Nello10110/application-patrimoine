import { render, screen } from '@testing-library/react'
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

  // Refonte « liquid glass » (étape 3) : l'item actif porte le dégradé d'accent
  // (`bg-[image:var(--accent-grad)]`), les inactifs n'ont plus de fond du tout.
  it('marque comme actif le lien correspondant à la route courante', () => {
    renderSidebar('/patrimoine')
    expect(screen.getByRole('link', { name: /^Patrimoine$/ })).toHaveClass('bg-[image:var(--accent-grad)]')
    expect(screen.getByRole('link', { name: /Synthèse/ })).not.toHaveClass('bg-[image:var(--accent-grad)]')
  })

  // Le repliage a été retiré à l'étape 3 de la refonte (largeur fixe de 222 px) :
  // il coûtait un bouton permanent, un hook persisté et une variante `compact` sur
  // trois composants pour gagner 96 px.
  it("n'a plus de bouton de repliage", () => {
    renderSidebar()
    expect(screen.queryByRole('button', { name: /barre latérale/ })).not.toBeInTheDocument()
  })
})
