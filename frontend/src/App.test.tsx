import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from './api/client'
import App from './App'

// Les pages sont chargées à la demande (`React.lazy`, cf. LOT 4.8) et appellent
// toutes l'API au montage : ce fichier ne teste que la barre latérale (navigation,
// menu du compte, bouton de thème, déconnexion), donc chaque page est remplacée
// par un composant vide.
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
    // Détenteurs (backlog 2.L.1) : `BarreControles` (rendue par `App`) lit
    // `listDetenteurs()` — non testé ici, résolution neutre.
    listDetenteurs: vi.fn().mockResolvedValue([]),
    // SSO : `LoginPage` (rendue après déconnexion) lit `getOidcStatus()` — non testé
    // ici, bouton simplement absent.
    getOidcStatus: vi.fn().mockResolvedValue({ enabled: false, display_name: 'SSO' }),
  },
}))

// Multi-utilisateur (Milestone 1) : `App` n'affiche la barre latérale/les routes
// qu'une fois connecté (cf. `AuthProvider`). Un jeton factice en `localStorage` +
// `getMe` qui résout font passer l'app en état "connecté" dès le premier rendu,
// comme le reste de ce fichier le suppose déjà.
beforeEach(() => {
  localStorage.setItem('patrimoine_auth_token', 'jeton-de-test')
  vi.mocked(api.getMe).mockResolvedValue({ id: 1, username: 'testeur', role: 'proprietaire' })
})

describe('App — barre latérale (backlog 2.K.2)', () => {
  it('le logo "Patrimoine" est un lien vers la synthèse', async () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    )

    expect(await screen.findByRole('link', { name: 'Application Patrimoine' })).toHaveAttribute('href', '/')
  })

  it('affiche les écrans de consultation, mais pas les écrans d\'administration', async () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    )

    await screen.findByRole('link', { name: /Synthèse/ })
    expect(screen.getByRole('link', { name: /^Patrimoine$/ })).toHaveAttribute('href', '/patrimoine')
    expect(screen.getByRole('link', { name: /Analyse/ })).toHaveAttribute('href', '/analyse')
    expect(screen.getByRole('link', { name: /Objectifs/ })).toHaveAttribute('href', '/objectifs')
    expect(screen.getByRole('link', { name: /Dividendes/ })).toHaveAttribute('href', '/dividendes')
    expect(screen.getByRole('link', { name: /Rapport/ })).toHaveAttribute('href', '/rapport')

    // Import/Réglages/Aide ne sont plus dans la barre latérale : seulement dans le
    // menu du compte, fermé par défaut.
    expect(screen.queryByRole('link', { name: /^Import$/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /^Réglages$/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /^Aide$/ })).not.toBeInTheDocument()
  })
})

describe('App — menu du compte (backlog 2.K.2 / 2.K.7)', () => {
  it('ne déconnecte jamais au clic direct sur l\'avatar : il faut ouvrir le menu puis choisir "Se déconnecter"', async () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    )

    const avatar = await screen.findByRole('button', { name: 'testeur' })
    fireEvent.click(avatar)

    // Le clic sur l'avatar ouvre le menu, il ne déconnecte pas.
    expect(localStorage.getItem('patrimoine_auth_token')).toBe('jeton-de-test')

    const boutonDeconnexion = await screen.findByRole('menuitem', { name: /Se déconnecter/ })
    fireEvent.click(boutonDeconnexion)

    await waitFor(() => expect(localStorage.getItem('patrimoine_auth_token')).toBeNull())
    expect(await screen.findByLabelText("Nom d'utilisateur")).toBeInTheDocument()
  })

  it('le menu du compte donne accès à Import, Réglages et Aide', async () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    )

    const avatar = await screen.findByRole('button', { name: 'testeur' })
    fireEvent.click(avatar)

    expect(await screen.findByRole('menuitem', { name: 'Import' })).toHaveAttribute('href', '/import')
    expect(screen.getByRole('menuitem', { name: 'Réglages' })).toHaveAttribute('href', '/reglages')
    expect(screen.getByRole('menuitem', { name: 'Aide' })).toHaveAttribute('href', '/aide')
  })

  it('se ferme avec la touche Échap', async () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    )

    const avatar = await screen.findByRole('button', { name: 'testeur' })
    fireEvent.click(avatar)
    await screen.findByRole('menu', { name: 'Menu du compte' })

    fireEvent.keyDown(document, { key: 'Escape' })

    await waitFor(() => expect(screen.queryByRole('menu', { name: 'Menu du compte' })).not.toBeInTheDocument())
  })

  it('contient le bouton de bascule du thème, qui fait cycler le thème au clic (LOT 5.12)', async () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    )

    const avatar = await screen.findByRole('button', { name: 'testeur' })
    fireEvent.click(avatar)

    const bouton = await screen.findByRole('button', { name: /Thème/ })
    expect(bouton).toHaveAccessibleName(/Système/)

    fireEvent.click(bouton)
    expect(bouton).toHaveAccessibleName(/Clair/)

    fireEvent.click(bouton)
    expect(bouton).toHaveAccessibleName(/Sombre/)
  })
})
