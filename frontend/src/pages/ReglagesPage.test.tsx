import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { api } from '../api/client'
import type { Detenteur, OidcConfig, Session } from '../api/types'
import ReglagesPage from './ReglagesPage'

// Ce fichier ne verrouille que la section "Personnes et sociétés" (backlog 2.L.1) —
// le reste de la page (préférences, tâches planifiées, export) est hors de son objet.
// Sessions/journal d'accès/comptes du foyer (backlog 2.L.2) : hors de l'objet de ce
// fichier, stubs neutres (listes vides) pour que les nouvelles cartes de la page ne
// fassent pas planter les tests existants sur "Personnes et sociétés".
vi.mock('../api/client', () => ({
  api: {
    listDetenteurs: vi.fn(),
    createDetenteur: vi.fn(),
    deleteDetenteur: vi.fn(),
    getPreferences: vi.fn().mockResolvedValue({ methode_cout: 'cout_moyen_pondere', seuil_alerte_ecart_pct: 5 }),
    listJobs: vi.fn().mockResolvedValue([]),
    listSessions: vi.fn().mockResolvedValue([]),
    getAccessLog: vi.fn().mockResolvedValue([]),
    listHouseholdMembers: vi.fn().mockResolvedValue([]),
    createHouseholdMember: vi.fn(),
    deleteHouseholdMember: vi.fn(),
    // Connexion SSO (backlog 2.L.3) : hors de l'objet des autres blocs de ce
    // fichier, stub neutre par défaut (aucune configuration existante).
    getOidcConfig: vi.fn().mockResolvedValue({
      issuer: null,
      client_id: null,
      redirect_uri: null,
      frontend_url: null,
      secret_configure: false,
      cle_chiffrement_definie: true,
      enabled: true,
      display_name: 'SSO',
      claim_username: 'preferred_username',
      claim_email: 'email',
      claim_nom: 'name',
    }),
    updateOidcConfig: vi.fn(),
  },
}))

function detenteur(overrides: Partial<Detenteur> = {}): Detenteur {
  return {
    id: 1,
    nom: 'Alice',
    type: 'personne',
    created_at: '2026-01-01T00:00:00',
    updated_at: '2026-01-01T00:00:00',
    ...overrides,
  }
}

describe('ReglagesPage — Personnes et sociétés (backlog 2.L.1)', () => {
  it("affiche un message quand aucun détenteur n'est déclaré", async () => {
    vi.mocked(api.listDetenteurs).mockResolvedValue([])
    render(<ReglagesPage />)

    await screen.findByText('Aucun détenteur déclaré.')
  })

  it('liste les détenteurs déclarés avec leur type', async () => {
    vi.mocked(api.listDetenteurs).mockResolvedValue([detenteur({ nom: 'Alice', type: 'personne' }), detenteur({ id: 2, nom: 'SCI Famille', type: 'societe' })])
    render(<ReglagesPage />)

    await screen.findByText('Alice')
    expect(screen.getByText('SCI Famille')).toBeInTheDocument()
    expect(screen.getByText('(Personne)')).toBeInTheDocument()
    expect(screen.getByText('(Société)')).toBeInTheDocument()
  })

  it('ajouter un détenteur appelle createDetenteur puis recharge la liste', async () => {
    // `GestionFoyerCard` (backlog 2.L.2) charge aussi `listDetenteurs` à son montage
    // (pour son sélecteur de périmètre invité) : un deuxième appel, neutre ici,
    // s'intercale avant le rechargement déclenché par "Ajouter" — d'où les 3 valeurs
    // enfilées plutôt que 2.
    vi.mocked(api.listDetenteurs).mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValue([detenteur({ nom: 'Bob' })])
    vi.mocked(api.createDetenteur).mockResolvedValue(detenteur({ nom: 'Bob' }))
    render(<ReglagesPage />)
    await screen.findByText('Aucun détenteur déclaré.')

    fireEvent.change(screen.getByPlaceholderText('Alice'), { target: { value: 'Bob' } })
    fireEvent.click(screen.getAllByRole('button', { name: 'Ajouter' })[0])

    await screen.findByText('Bob')
    expect(api.createDetenteur).toHaveBeenCalledWith('Bob', 'personne')
  })

  it('supprimer un détenteur appelle deleteDetenteur puis recharge la liste', async () => {
    vi.mocked(api.listDetenteurs).mockResolvedValueOnce([detenteur({ nom: 'Alice' })]).mockResolvedValueOnce([detenteur({ nom: 'Alice' })]).mockResolvedValue([])
    vi.mocked(api.deleteDetenteur).mockResolvedValue({ ok: true })
    render(<ReglagesPage />)
    await screen.findByText('Alice')

    fireEvent.click(screen.getAllByRole('button', { name: 'Supprimer' })[0])

    await screen.findByText('Aucun détenteur déclaré.')
    expect(api.deleteDetenteur).toHaveBeenCalledWith(1)
  })

  it('Réessayer relance listDetenteurs après un échec', async () => {
    vi.mocked(api.listDetenteurs).mockRejectedValueOnce(new Error('panne détenteurs'))
    render(<ReglagesPage />)
    await screen.findByText('panne détenteurs')

    vi.mocked(api.listDetenteurs).mockResolvedValue([detenteur({ nom: 'Alice' })])
    fireEvent.click(screen.getAllByRole('button', { name: 'Réessayer' })[0])

    await screen.findByText('Alice')
  })
})

function session(overrides: Partial<Session> = {}): Session {
  return {
    id_session: 'sess-1',
    created_at: '2026-08-21T09:00:00',
    expires_at: '2026-09-20T09:00:00',
    ip: '192.0.2.1',
    user_agent: 'Firefox',
    derniere_utilisation: '2026-08-21T10:00:00',
    est_courante: false,
    ...overrides,
  }
}

describe('ReglagesPage — Sessions actives, erreur avec action de reprise (backlog 2.K.5)', () => {
  it('Réessayer relance listSessions après un échec', async () => {
    vi.mocked(api.listSessions).mockRejectedValueOnce(new Error('panne sessions'))
    render(<ReglagesPage />)
    await screen.findByText('panne sessions')

    vi.mocked(api.listSessions).mockResolvedValueOnce([session()])
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }))

    await screen.findByText('192.0.2.1')
  })
})

describe('ReglagesPage — Comptes du foyer, affichage nom/email (backlog SSO)', () => {
  it('affiche le nom (si renseigné) et l’email à côté du rôle', async () => {
    vi.mocked(api.listHouseholdMembers).mockResolvedValue([
      { id: 2, username: 'paul.oidc', role: 'membre', created_at: '2026-01-01T00:00:00', detenteur_ids: [], nom: 'Paul Cartieri', email: 'paul@example.com' },
    ])
    render(<ReglagesPage />)

    await screen.findByText('Paul Cartieri')
    expect(screen.getByText('· paul@example.com', { exact: false })).toBeInTheDocument()
    expect(screen.queryByText('paul.oidc')).not.toBeInTheDocument()
  })

  it('sans nom, affiche le username (comportement inchangé pour un compte mot de passe)', async () => {
    vi.mocked(api.listHouseholdMembers).mockResolvedValue([
      { id: 3, username: 'conjoint', role: 'membre', created_at: '2026-01-01T00:00:00', detenteur_ids: [] },
    ])
    render(<ReglagesPage />)

    await screen.findByText('conjoint')
  })
})

function oidcConfig(overrides: Partial<OidcConfig> = {}): OidcConfig {
  return {
    issuer: null,
    client_id: null,
    redirect_uri: null,
    frontend_url: null,
    secret_configure: false,
    cle_chiffrement_definie: true,
    enabled: true,
    display_name: 'SSO',
    claim_username: 'preferred_username',
    claim_email: 'email',
    claim_nom: 'name',
    ...overrides,
  }
}

describe('ReglagesPage — Connexion SSO (backlog 2.L.3)', () => {
  it('préremplit les champs depuis la configuration existante, jamais le secret', async () => {
    vi.mocked(api.getOidcConfig).mockResolvedValue(
      oidcConfig({
        issuer: 'https://sso.example.com/application/o/patrimoine',
        client_id: 'client-abc',
        redirect_uri: 'https://patrimoine.example.com/api/auth/oidc/callback',
        frontend_url: 'https://patrimoine.example.com',
        secret_configure: true,
        display_name: 'Authentik',
      }),
    )
    render(<ReglagesPage />)

    expect(await screen.findByDisplayValue('https://sso.example.com/application/o/patrimoine')).toBeInTheDocument()
    expect(screen.getByDisplayValue('client-abc')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Authentik')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Laisser vide pour conserver le secret actuel')).toBeInTheDocument()
  })

  it("soumettre appelle updateOidcConfig avec les champs (dont activation/nom/mapping), le secret omis si le champ est laissé vide", async () => {
    vi.mocked(api.getOidcConfig).mockResolvedValue(
      oidcConfig({
        issuer: 'https://sso.example.com/application/o/patrimoine',
        client_id: 'client-abc',
        redirect_uri: 'https://patrimoine.example.com/api/auth/oidc/callback',
        frontend_url: 'https://patrimoine.example.com',
        secret_configure: true,
      }),
    )
    vi.mocked(api.updateOidcConfig).mockResolvedValue(oidcConfig({ secret_configure: true }))
    render(<ReglagesPage />)
    await screen.findByDisplayValue('client-abc')

    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    await vi.waitFor(() =>
      expect(api.updateOidcConfig).toHaveBeenCalledWith({
        issuer: 'https://sso.example.com/application/o/patrimoine',
        client_id: 'client-abc',
        redirect_uri: 'https://patrimoine.example.com/api/auth/oidc/callback',
        frontend_url: 'https://patrimoine.example.com',
        enabled: true,
        display_name: 'SSO',
        claim_username: 'preferred_username',
        claim_email: 'email',
        claim_nom: 'name',
      }),
    )
  })

  it("décocher Activée puis enregistrer envoie enabled: false", async () => {
    vi.mocked(api.getOidcConfig).mockResolvedValue(oidcConfig({ issuer: 'https://sso.example.com', client_id: 'x', redirect_uri: 'y', frontend_url: 'z' }))
    vi.mocked(api.updateOidcConfig).mockResolvedValue(oidcConfig({ enabled: false }))
    render(<ReglagesPage />)
    await screen.findByDisplayValue('https://sso.example.com')

    fireEvent.click(screen.getByRole('checkbox', { name: 'Activée' }))
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    await vi.waitFor(() => expect(api.updateOidcConfig).toHaveBeenCalledWith(expect.objectContaining({ enabled: false })))
  })

  it('un secret saisi est inclus dans updateOidcConfig', async () => {
    vi.mocked(api.getOidcConfig).mockResolvedValue(oidcConfig())
    vi.mocked(api.updateOidcConfig).mockResolvedValue(oidcConfig({ secret_configure: true }))
    render(<ReglagesPage />)
    await screen.findByPlaceholderText('Non configuré')

    fireEvent.change(screen.getByLabelText(/Issuer/), {
      target: { value: 'https://sso.example.com/application/o/patrimoine' },
    })
    fireEvent.change(screen.getByLabelText('Client ID'), { target: { value: 'client-abc' } })
    fireEvent.change(screen.getByLabelText('Client Secret'), { target: { value: 'nouveau-secret' } })
    fireEvent.change(screen.getByLabelText(/Redirect URI/), {
      target: { value: 'https://patrimoine.example.com/api/auth/oidc/callback' },
    })
    fireEvent.change(screen.getByLabelText(/URL publique du frontend/), { target: { value: 'https://patrimoine.example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    await vi.waitFor(() =>
      expect(api.updateOidcConfig).toHaveBeenCalledWith(
        expect.objectContaining({ client_secret: 'nouveau-secret' }),
      ),
    )
  })

  it('personnaliser un claim mapping est inclus dans updateOidcConfig', async () => {
    vi.mocked(api.getOidcConfig).mockResolvedValue(
      oidcConfig({ issuer: 'https://sso.example.com', client_id: 'x', redirect_uri: 'y', frontend_url: 'z' }),
    )
    vi.mocked(api.updateOidcConfig).mockResolvedValue(oidcConfig())
    render(<ReglagesPage />)
    await screen.findByDisplayValue('https://sso.example.com')

    fireEvent.change(screen.getByLabelText(/Claim → email/), { target: { value: 'mail' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    await vi.waitFor(() => expect(api.updateOidcConfig).toHaveBeenCalledWith(expect.objectContaining({ claim_email: 'mail' })))
  })

  it("affiche un avertissement si PATRIMOINE_SECRET_KEY n'est pas définie côté serveur", async () => {
    vi.mocked(api.getOidcConfig).mockResolvedValue(oidcConfig({ cle_chiffrement_definie: false }))
    render(<ReglagesPage />)

    await screen.findByText(/PATRIMOINE_SECRET_KEY/)
  })
})
