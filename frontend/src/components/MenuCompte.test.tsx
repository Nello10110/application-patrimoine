import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { AuthContext, type AuthContextValue } from '../contexts/authContextObject'
import MenuCompte from './MenuCompte'

function renderMenu() {
  const logout = vi.fn()
  const valeur: AuthContextValue = {
    user: { id: 1, username: 'testeur' },
    loading: false,
    login: async () => {},
    register: async () => {},
    logout,
  }
  const resultat = render(
    <MemoryRouter>
      <AuthContext.Provider value={valeur}>
        <MenuCompte />
      </AuthContext.Provider>
    </MemoryRouter>,
  )
  return { logout, ...resultat }
}

describe('MenuCompte (backlog 2.K.2 / 2.K.7)', () => {
  it('est fermé par défaut', () => {
    renderMenu()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it("s'ouvre au clic sur l'avatar et propose Import, Réglages, Aide, le thème et la déconnexion", () => {
    renderMenu()
    fireEvent.click(screen.getByRole('button', { name: 'testeur' }))

    expect(screen.getByRole('menu', { name: 'Menu du compte' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Import' })).toHaveAttribute('href', '/import')
    expect(screen.getByRole('menuitem', { name: 'Réglages' })).toHaveAttribute('href', '/reglages')
    expect(screen.getByRole('menuitem', { name: 'Aide' })).toHaveAttribute('href', '/aide')
    expect(screen.getByRole('button', { name: /Thème/ })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /Se déconnecter/ })).toBeInTheDocument()
  })

  it("la déconnexion ne se déclenche jamais depuis le bouton avatar lui-même, seulement depuis l'item du menu", () => {
    const { logout } = renderMenu()
    const avatar = screen.getByRole('button', { name: 'testeur' })

    fireEvent.click(avatar)
    expect(logout).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('menuitem', { name: /Se déconnecter/ }))
    expect(logout).toHaveBeenCalledTimes(1)
  })

  it('se ferme au clic extérieur', async () => {
    renderMenu()
    fireEvent.click(screen.getByRole('button', { name: 'testeur' }))
    expect(screen.getByRole('menu')).toBeInTheDocument()

    fireEvent.mouseDown(document.body)

    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
  })

  it('se ferme avec la touche Échap', async () => {
    renderMenu()
    fireEvent.click(screen.getByRole('button', { name: 'testeur' }))

    fireEvent.keyDown(document, { key: 'Escape' })

    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
  })
})
