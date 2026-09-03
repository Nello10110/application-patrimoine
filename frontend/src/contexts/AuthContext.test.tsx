import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../api/client'
import type { AuthUser } from '../api/types'
import { clearToken, getToken } from '../auth/tokenStorage'
import { useAuth } from '../hooks/useAuth'
import { AuthProvider } from './AuthContext'

vi.mock('../api/client', () => ({
  api: {
    getMe: vi.fn(),
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
  },
}))

function utilisateur(overrides: Partial<AuthUser> = {}): AuthUser {
  return { id: 1, username: 'alice', role: 'proprietaire', onboarding_termine: true, holdings_sans_compte: 0, ...overrides }
}

function Sonde() {
  const { user, loading } = useAuth()
  if (loading) return <p>Chargement...</p>
  return <p>{user ? `Connecté : ${user.username}` : 'Déconnecté'}</p>
}

describe('AuthProvider — retour de connexion Authentik (backlog SSO Authentik)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearToken()
    window.history.replaceState(null, '', '/')
  })

  it("capture un jeton en fragment d'URL au montage, nettoie l'URL, et se connecte", async () => {
    vi.mocked(api.getMe).mockResolvedValue(utilisateur())
    window.history.replaceState(null, '', '/#token=jeton-authentik-123')

    render(
      <AuthProvider>
        <Sonde />
      </AuthProvider>,
    )

    await screen.findByText('Connecté : alice')
    expect(getToken()).toBe('jeton-authentik-123')
    expect(window.location.hash).toBe('')
    expect(api.getMe).toHaveBeenCalledTimes(1)
  })

  it("sans fragment ni jeton stocké, reste déconnecté sans appeler getMe", async () => {
    render(
      <AuthProvider>
        <Sonde />
      </AuthProvider>,
    )

    await screen.findByText('Déconnecté')
    expect(api.getMe).not.toHaveBeenCalled()
  })

  it('un jeton déjà en localStorage (sans fragment) est validé normalement', async () => {
    vi.mocked(api.getMe).mockResolvedValue(utilisateur({ username: 'bob' }))
    localStorage.setItem('patrimoine_auth_token', 'jeton-existant')

    render(
      <AuthProvider>
        <Sonde />
      </AuthProvider>,
    )

    await screen.findByText('Connecté : bob')
  })
})
