import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from './api/client'
import App from './App'

// Les pages sont chargées à la demande (`React.lazy`, cf. LOT 4.8) et appellent
// toutes l'API au montage : ce fichier ne teste que l'en-tête (navigation, bouton de
// thème, déconnexion), donc chaque page est remplacée par un composant vide.
vi.mock('./pages/DashboardPage', () => ({ default: () => <div /> }))
vi.mock('./pages/DividendesPage', () => ({ default: () => <div /> }))
vi.mock('./pages/RapportPage', () => ({ default: () => <div /> }))
vi.mock('./pages/PortefeuillePage', () => ({ default: () => <div /> }))
vi.mock('./pages/HoldingDetailPage', () => ({ default: () => <div /> }))
vi.mock('./pages/RepartitionPage', () => ({ default: () => <div /> }))
vi.mock('./pages/ImportPage', () => ({ default: () => <div /> }))
vi.mock('./pages/ReglagesPage', () => ({ default: () => <div /> }))
vi.mock('./pages/AidePage', () => ({ default: () => <div /> }))
vi.mock('./pages/SimulateurPage', () => ({ default: () => <div /> }))

vi.mock('./api/client', () => ({
  api: {
    getMe: vi.fn(),
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn().mockResolvedValue(undefined),
  },
}))

// Multi-utilisateur (Milestone 1) : `App` n'affiche l'en-tête/les routes qu'une fois
// connecté (cf. `AuthProvider`). Un jeton factice en `localStorage` + `getMe` qui
// résout font passer l'app en état "connecté" dès le premier rendu, comme le reste
// de ce fichier le suppose déjà.
beforeEach(() => {
  localStorage.setItem('patrimoine_auth_token', 'jeton-de-test')
  vi.mocked(api.getMe).mockResolvedValue({ id: 1, username: 'testeur' })
})

describe('App — en-tête', () => {
  it('le titre "Application Patrimoine" est un lien vers le tableau de bord', async () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    )

    expect(await screen.findByRole('link', { name: 'Application Patrimoine' })).toHaveAttribute('href', '/')
  })

  it("affiche l'avatar et le nom de l'utilisateur connecté, qui déconnecte au clic", async () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    )

    const avatar = await screen.findByRole('button', { name: 'testeur' })
    expect(avatar).toHaveAttribute('title', 'Se déconnecter')

    fireEvent.click(avatar)

    await waitFor(() => expect(localStorage.getItem('patrimoine_auth_token')).toBeNull())
    expect(await screen.findByLabelText("Nom d'utilisateur")).toBeInTheDocument()
  })
})

describe('App — bouton de bascule du thème (LOT 5.12)', () => {
  it("affiche un bouton de bascule dans l'en-tête, qui fait cycler le thème au clic", async () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    )

    const bouton = await screen.findByRole('button', { name: /Thème/ })
    expect(bouton).toBeInTheDocument()
    expect(bouton).toHaveAccessibleName(/Système/)

    fireEvent.click(bouton)
    expect(bouton).toHaveAccessibleName(/Clair/)

    fireEvent.click(bouton)
    expect(bouton).toHaveAccessibleName(/Sombre/)
  })
})
