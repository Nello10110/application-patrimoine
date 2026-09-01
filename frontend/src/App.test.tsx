import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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
    // `listDetenteurs()` — non testé ici, résolution neutre. Réutilisée aussi par
    // l'étape "Détenteurs du foyer" du `WelcomeWizard` (assistant de bienvenue).
    listDetenteurs: vi.fn().mockResolvedValue([]),
    // SSO : `LoginPage` (rendue après déconnexion) lit `getOidcStatus()` — non testé
    // ici, bouton simplement absent.
    getOidcStatus: vi.fn().mockResolvedValue({ enabled: false, display_name: 'SSO' }),
    // Assistant de bienvenue (welcome board) : étapes "Préférences"/"Démarrer le
    // portefeuille" du `WelcomeWizard`, réutilisent `PreferencesCard`/`listHoldings` —
    // non testées ici (les tests de ce fichier ne dépassent pas la 1ère étape),
    // résolutions neutres au cas où.
    getPreferences: vi.fn().mockResolvedValue({ methode_cout: 'cout_moyen_pondere', taux_imposition_pct: null }),
    listHoldings: vi.fn().mockResolvedValue([]),
    completeOnboarding: vi.fn(),
  },
}))

// Multi-utilisateur (Milestone 1) : `App` n'affiche la barre latérale/les routes
// qu'une fois connecté (cf. `AuthProvider`). Un jeton factice en `localStorage` +
// `getMe` qui résout font passer l'app en état "connecté" dès le premier rendu,
// comme le reste de ce fichier le suppose déjà.
beforeEach(() => {
  localStorage.setItem('patrimoine_auth_token', 'jeton-de-test')
  vi.mocked(api.getMe).mockResolvedValue({ id: 1, username: 'testeur', role: 'proprietaire', onboarding_termine: true })
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

    // Scopé à la barre latérale (backlog 2.K.4) : `BottomNav`, toujours montée en
    // parallèle (masquée en CSS seulement — jsdom n'applique pas `md:hidden`),
    // reprend les 4 premiers écrans de consultation, d'où l'ambiguïté sinon.
    const barreLaterale = await screen.findByRole('navigation', { name: 'Navigation principale' })
    expect(within(barreLaterale).getByRole('link', { name: /Synthèse/ })).toHaveAttribute('href', '/')
    expect(within(barreLaterale).getByRole('link', { name: /^Patrimoine$/ })).toHaveAttribute('href', '/patrimoine')
    expect(within(barreLaterale).getByRole('link', { name: /Objectifs/ })).toHaveAttribute('href', '/objectifs')
    expect(within(barreLaterale).getByRole('link', { name: /Dividendes/ })).toHaveAttribute('href', '/dividendes')
    expect(within(barreLaterale).getByRole('link', { name: /Rapport/ })).toHaveAttribute('href', '/rapport')

    // Import/Réglages/Aide ne sont plus dans la barre latérale : seulement dans le
    // menu du compte, fermé par défaut.
    expect(within(barreLaterale).queryByRole('link', { name: /^Import$/ })).not.toBeInTheDocument()
    expect(within(barreLaterale).queryByRole('link', { name: /^Réglages$/ })).not.toBeInTheDocument()
    expect(within(barreLaterale).queryByRole('link', { name: /^Aide$/ })).not.toBeInTheDocument()
  })
})

describe('App — navigation inférieure mobile (backlog 2.K.4)', () => {
  it('propose 4 écrans de consultation en direct, puis "Plus" pour le reste', async () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    )

    const navMobile = await screen.findByRole('navigation', { name: 'Navigation principale (mobile)' })
    expect(within(navMobile).getByRole('link', { name: /Synthèse/ })).toHaveAttribute('href', '/')
    expect(within(navMobile).getByRole('link', { name: /^Patrimoine$/ })).toHaveAttribute('href', '/patrimoine')
    expect(within(navMobile).getByRole('link', { name: /Objectifs/ })).toHaveAttribute('href', '/objectifs')
    expect(within(navMobile).getByRole('link', { name: /Épargne/ })).toHaveAttribute('href', '/epargne')
    // Dividendes/Rapport ne tiennent pas dans les 4 entrées directes : rangés
    // derrière "Plus", fermé par défaut.
    expect(within(navMobile).queryByRole('link', { name: /Dividendes/ })).not.toBeInTheDocument()
    expect(within(navMobile).queryByRole('link', { name: /Rapport/ })).not.toBeInTheDocument()
    expect(within(navMobile).getByRole('button', { name: 'Plus' })).toBeInTheDocument()
  })

  it('"Plus" ouvre une feuille avec Dividendes/Rapport, Import/Réglages/Aide, thème et déconnexion', async () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    )

    const navMobile = await screen.findByRole('navigation', { name: 'Navigation principale (mobile)' })
    fireEvent.click(within(navMobile).getByRole('button', { name: 'Plus' }))

    const feuille = await screen.findByRole('dialog')
    expect(within(feuille).getByRole('link', { name: /Dividendes/ })).toHaveAttribute('href', '/dividendes')
    expect(within(feuille).getByRole('link', { name: /Rapport/ })).toHaveAttribute('href', '/rapport')
    expect(within(feuille).getByRole('link', { name: 'Import' })).toHaveAttribute('href', '/import')
    expect(within(feuille).getByRole('link', { name: 'Réglages' })).toHaveAttribute('href', '/reglages')
    expect(within(feuille).getByRole('link', { name: 'Aide' })).toHaveAttribute('href', '/aide')
    expect(within(feuille).getByRole('button', { name: /Thème/ })).toBeInTheDocument()
    expect(within(feuille).getByRole('button', { name: /Se déconnecter/ })).toBeInTheDocument()
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

describe('App — assistant de configuration initiale (welcome board)', () => {
  it('un propriétaire dont l\'onboarding n\'est pas terminé voit l\'assistant, pas le tableau de bord', async () => {
    vi.mocked(api.getMe).mockResolvedValue({ id: 1, username: 'testeur', role: 'proprietaire', onboarding_termine: false })

    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    )

    expect(await screen.findByRole('heading', { name: 'Configuration initiale' })).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Navigation principale' })).not.toBeInTheDocument()
  })

  it('un propriétaire dont l\'onboarding est terminé voit directement l\'application', async () => {
    vi.mocked(api.getMe).mockResolvedValue({ id: 1, username: 'testeur', role: 'proprietaire', onboarding_termine: true })

    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    )

    expect(await screen.findByRole('navigation', { name: 'Navigation principale' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Configuration initiale' })).not.toBeInTheDocument()
  })

  it("un membre du foyer avec onboarding_termine=false voit quand même directement l'application (assistant réservé au propriétaire)", async () => {
    vi.mocked(api.getMe).mockResolvedValue({ id: 2, username: 'membre', role: 'membre', onboarding_termine: false })

    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    )

    expect(await screen.findByRole('navigation', { name: 'Navigation principale' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Configuration initiale' })).not.toBeInTheDocument()
  })
})
