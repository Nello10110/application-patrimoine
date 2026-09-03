import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { AuthContext, type AuthContextValue } from '../contexts/authContextObject'
import BottomNav from './BottomNav'

function utilisateur(overrides: Partial<AuthContextValue['user']> = {}): AuthContextValue {
  return {
    user: { id: 1, username: 'testeur', role: 'proprietaire', onboarding_termine: true, holdings_sans_compte: 0, ...overrides },
    loading: false,
    login: async () => {},
    register: async () => {},
    logout: () => {},
    completeOnboarding: async () => {},
    refetchUser: async () => {},
  }
}

function renderNav(auth: AuthContextValue, path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthContext.Provider value={auth}>
        <BottomNav />
      </AuthContext.Provider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  localStorage.clear()
})

describe('BottomNav (backlog 2.K.4)', () => {
  it('propriétaire : 4 écrans de consultation en direct + "Plus", cibles tactiles ≥ 44 px (h-16)', () => {
    renderNav(utilisateur())

    const nav = screen.getByRole('navigation', { name: 'Navigation principale (mobile)' })
    expect(nav).toHaveClass('h-16') // 64px, largement au-dessus des 44px requis
    expect(within(nav).getByRole('link', { name: /Synthèse/ })).toHaveAttribute('href', '/')
    expect(within(nav).getByRole('link', { name: /^Patrimoine$/ })).toHaveAttribute('href', '/patrimoine')
    expect(within(nav).getByRole('link', { name: /Objectifs/ })).toHaveAttribute('href', '/objectifs')
    expect(within(nav).getByRole('link', { name: /Comptes/ })).toHaveAttribute('href', '/comptes')
    expect(within(nav).queryByRole('link', { name: /Dividendes/ })).not.toBeInTheDocument()
    expect(within(nav).queryByRole('link', { name: /Rapport/ })).not.toBeInTheDocument()
    expect(within(nav).getByRole('button', { name: 'Plus' })).toBeInTheDocument()
  })

  it('marque comme actif le lien correspondant à la route courante', () => {
    renderNav(utilisateur(), '/patrimoine')

    expect(screen.getByRole('link', { name: /^Patrimoine$/ })).toHaveClass('text-accent')
    expect(screen.getByRole('link', { name: /Synthèse/ })).not.toHaveClass('text-accent')
  })

  it('invité : seuls Synthèse/Patrimoine/Épargne en direct (rôle restreint, backlog 2.L.2), "Plus" reste présent', () => {
    renderNav(utilisateur({ role: 'invite' }))

    const nav = screen.getByRole('navigation', { name: 'Navigation principale (mobile)' })
    expect(within(nav).getByRole('link', { name: /Synthèse/ })).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: /^Patrimoine$/ })).toBeInTheDocument()
    expect(within(nav).queryByRole('link', { name: /Objectifs/ })).not.toBeInTheDocument()
    expect(within(nav).getByRole('button', { name: 'Plus' })).toBeInTheDocument()
  })

  it("« Plus » ouvre une feuille avec Dividendes/Rapport, Import/Réglages/Aide, thème et déconnexion", async () => {
    renderNav(utilisateur())

    fireEvent.click(screen.getByRole('button', { name: 'Plus' }))

    const feuille = await screen.findByRole('dialog')
    expect(within(feuille).getByRole('link', { name: /Dividendes/ })).toHaveAttribute('href', '/dividendes')
    expect(within(feuille).getByRole('link', { name: /Rapport/ })).toHaveAttribute('href', '/rapport')
    expect(within(feuille).getByRole('link', { name: 'Import' })).toHaveAttribute('href', '/import')
    expect(within(feuille).getByRole('link', { name: 'Réglages' })).toHaveAttribute('href', '/reglages')
    expect(within(feuille).getByRole('link', { name: 'Aide' })).toHaveAttribute('href', '/aide')
    expect(within(feuille).getByRole('button', { name: /Thème/ })).toBeInTheDocument()
  })

  it('un clic sur "Se déconnecter" dans la feuille "Plus" appelle logout()', async () => {
    let deconnecte = false
    renderNav({ ...utilisateur(), logout: () => (deconnecte = true) })

    fireEvent.click(screen.getByRole('button', { name: 'Plus' }))
    const boutonDeconnexion = await screen.findByRole('button', { name: /Se déconnecter/ })
    fireEvent.click(boutonDeconnexion)

    expect(deconnecte).toBe(true)
  })

  it('Échap ferme la feuille "Plus"', async () => {
    renderNav(utilisateur())

    fireEvent.click(screen.getByRole('button', { name: 'Plus' }))
    await screen.findByRole('dialog')

    fireEvent.keyDown(document, { key: 'Escape' })

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })
})
