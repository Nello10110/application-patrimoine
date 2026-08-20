import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '../hooks/useAuth'
import LoginPage from './LoginPage'

vi.mock('../hooks/useAuth', () => ({
  useAuth: vi.fn(),
}))

describe('LoginPage', () => {
  const login = vi.fn()
  const register = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useAuth).mockReturnValue({ user: null, loading: false, login, register, logout: vi.fn() })
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
