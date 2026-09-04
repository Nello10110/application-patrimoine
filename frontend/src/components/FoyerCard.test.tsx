import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { api } from '../api/client'
import { AuthContext, type AuthContextValue } from '../contexts/authContextObject'
import FoyerCard from './FoyerCard'

vi.mock('../api/client', () => ({
  api: {
    updateFoyerNom: vi.fn(),
  },
}))

function renderCard(foyerNom: string | null = null, refetchUser = vi.fn(async () => {})) {
  const utilisateurFactice: AuthContextValue = {
    user: { id: 1, username: 'testeur', role: 'proprietaire', onboarding_termine: true, holdings_sans_compte: 0, foyer_nom: foyerNom },
    loading: false,
    login: async () => {},
    register: async () => {},
    logout: () => {},
    completeOnboarding: async () => {},
    refetchUser,
  }
  render(
    <AuthContext.Provider value={utilisateurFactice}>
      <FoyerCard />
    </AuthContext.Provider>,
  )
}

describe('FoyerCard (revue du 05/09/2026, gestion du foyer dans sa globalité)', () => {
  it('préremplit le champ avec le nom de foyer déjà enregistré', () => {
    renderCard('Famille Dupont')

    expect(screen.getByLabelText('Nom du foyer')).toHaveValue('Famille Dupont')
  })

  it('le champ reste vide tant qu’aucun nom n’a été renseigné', () => {
    renderCard(null)

    expect(screen.getByLabelText('Nom du foyer')).toHaveValue('')
  })

  it('enregistrer appelle updateFoyerNom puis refetchUser', async () => {
    vi.mocked(api.updateFoyerNom).mockResolvedValue({
      id: 1,
      username: 'testeur',
      role: 'proprietaire',
      onboarding_termine: true,
      holdings_sans_compte: 0,
      foyer_nom: 'Famille Dupont',
    })
    const refetchUser = vi.fn(async () => {})
    renderCard(null, refetchUser)

    fireEvent.change(screen.getByLabelText('Nom du foyer'), { target: { value: 'Famille Dupont' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    await waitFor(() => expect(api.updateFoyerNom).toHaveBeenCalledWith('Famille Dupont'))
    await waitFor(() => expect(refetchUser).toHaveBeenCalledTimes(1))
    expect(await screen.findByText('Nom enregistré.')).toBeInTheDocument()
  })

  it('le bouton Enregistrer reste inactif tant que le champ est vide', () => {
    renderCard(null)

    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeDisabled()
  })

  it("affiche l'erreur du serveur sans casser la carte", async () => {
    vi.mocked(api.updateFoyerNom).mockRejectedValue(new Error('Le nom du foyer doit contenir entre 1 et 60 caractères.'))
    renderCard(null)

    fireEvent.change(screen.getByLabelText('Nom du foyer'), { target: { value: 'x' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    expect(await screen.findByText(/entre 1 et 60 caractères/)).toBeInTheDocument()
  })
})
