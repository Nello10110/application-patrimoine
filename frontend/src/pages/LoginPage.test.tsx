import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../api/client'
import { useAuth } from '../hooks/useAuth'
import LoginPage from './LoginPage'

vi.mock('../api/client', () => ({
  api: {
    getOidcStatus: vi.fn(),
  },
}))

vi.mock('../hooks/useAuth', () => ({
  useAuth: vi.fn(),
}))

describe('LoginPage', () => {
  const login = vi.fn()
  const register = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useAuth).mockReturnValue({ user: null, loading: false, login, register, logout: vi.fn(), completeOnboarding: vi.fn() })
    vi.mocked(api.getOidcStatus).mockResolvedValue({ enabled: false, display_name: 'SSO' })
    window.history.replaceState(null, '', '/login')
  })

  it("mode connexion par défaut : soumettre appelle login avec nom d'utilisateur/mot de passe", async () => {
    const { container } = render(<LoginPage />)

    fireEvent.change(screen.getByLabelText("Nom d'utilisateur"), { target: { value: 'paul' } })
    fireEvent.change(screen.getByLabelText(/Mot de passe/), { target: { value: 'mot-de-passe-solide' } })
    fireEvent.submit(container.querySelector('form')!)

    await waitFor(() => expect(login).toHaveBeenCalledWith('paul', 'mot-de-passe-solide'))
    expect(register).not.toHaveBeenCalled()
  })

  it('bascule vers "Créer un compte" : soumettre appelle register', async () => {
    render(<LoginPage />)

    fireEvent.click(screen.getByRole('button', { name: 'Créer un compte' }))
    fireEvent.change(screen.getByLabelText("Nom d'utilisateur"), { target: { value: 'paul' } })
    fireEvent.change(screen.getByLabelText(/Mot de passe/), { target: { value: 'mot-de-passe-solide' } })
    fireEvent.click(screen.getByRole('button', { name: 'Créer mon compte' }))

    await waitFor(() => expect(register).toHaveBeenCalledWith('paul', 'mot-de-passe-solide'))
    expect(login).not.toHaveBeenCalled()
  })

  it("affiche le message d'erreur renvoyé par login sans planter", async () => {
    login.mockRejectedValueOnce(new Error("Nom d'utilisateur ou mot de passe incorrect."))
    const { container } = render(<LoginPage />)

    fireEvent.change(screen.getByLabelText("Nom d'utilisateur"), { target: { value: 'paul' } })
    fireEvent.change(screen.getByLabelText(/Mot de passe/), { target: { value: 'mauvais' } })
    fireEvent.submit(container.querySelector('form')!)

    await screen.findByText("Nom d'utilisateur ou mot de passe incorrect.")
  })
})

describe('LoginPage — connexion SSO (backlog SSO)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useAuth).mockReturnValue({ user: null, loading: false, login: vi.fn(), register: vi.fn(), logout: vi.fn(), completeOnboarding: vi.fn() })
    window.history.replaceState(null, '', '/login')
  })

  it("n'affiche pas le bouton SSO quand il n'est pas configuré (ou désactivé) sur ce déploiement", async () => {
    vi.mocked(api.getOidcStatus).mockResolvedValue({ enabled: false, display_name: 'SSO' })

    render(<LoginPage />)

    await vi.waitFor(() => expect(api.getOidcStatus).toHaveBeenCalled())
    expect(screen.queryByRole('link', { name: /SSO/ })).not.toBeInTheDocument()
  })

  it('affiche le bouton SSO avec le nom choisi par le propriétaire, pointant vers /api/auth/oidc/login', async () => {
    vi.mocked(api.getOidcStatus).mockResolvedValue({ enabled: true, display_name: 'Authentik' })

    render(<LoginPage />)

    const lien = await screen.findByRole('link', { name: /Se connecter avec Authentik/ })
    expect(lien).toHaveAttribute('href', '/api/auth/oidc/login')
  })

  it("affiche le message d'erreur porté par ?oidc_error= puis nettoie l'URL", async () => {
    vi.mocked(api.getOidcStatus).mockResolvedValue({ enabled: false, display_name: 'SSO' })
    window.history.replaceState(null, '', '/login?oidc_error=Connexion%20SSO%20refus%C3%A9e')

    render(<LoginPage />)

    expect(screen.getByText('Connexion SSO refusée')).toBeInTheDocument()
    await vi.waitFor(() => expect(window.location.search).toBe(''))
  })
})
