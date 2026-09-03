import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../api/client'
import type { Detenteur, OidcConfig, Session } from '../api/types'
import { ETAPES_ONBOARDING } from '../components/onboarding/steps'
import { AuthContext, type AuthContextValue } from '../contexts/authContextObject'
import ReglagesPage from './ReglagesPage'

// La page est désormais organisée en onglets (retour utilisateur : trop de cartes
// empilées sur une seule colonne) — chaque groupe de tests ouvre l'onglet qui
// contient la carte visée avant d'interagir avec elle. `useSearchParams` (sélection
// de l'onglet portée par l'URL) exige un routeur. `AuthContext.Provider` : la page
// lit désormais `useAuth()` (bouton "Revoir l'assistant de bienvenue", réservé au
// propriétaire) — même patron de contexte factice que `Sidebar.test.tsx`.
const utilisateurFactice: AuthContextValue = {
  user: { id: 1, username: 'testeur', role: 'proprietaire', onboarding_termine: true, holdings_sans_compte: 0 },
  loading: false,
  login: async () => {},
  register: async () => {},
  logout: () => {},
  completeOnboarding: async () => {},
  refetchUser: async () => {},
}

function renderReglages() {
  render(
    <MemoryRouter>
      <AuthContext.Provider value={utilisateurFactice}>
        <ReglagesPage />
      </AuthContext.Provider>
    </MemoryRouter>,
  )
}

function ouvrirOnglet(nom: string) {
  fireEvent.click(screen.getByRole('tab', { name: nom }))
}

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
    // Établissements (écran Comptes, backlog X.1) : `EtablissementsCard` est
    // montée dans le même onglet que les détenteurs — hors de l'objet des tests de
    // ce fichier, stub neutre par défaut (aucun établissement existant).
    listEtablissements: vi.fn().mockResolvedValue([]),
    createEtablissement: vi.fn(),
    updateEtablissement: vi.fn(),
    deleteEtablissement: vi.fn(),
    // Étape "Comptes" de l'assistant de bienvenue (backlog X.3), rejouable depuis
    // cet onglet (« Revoir l'assistant de bienvenue ») — hors de l'objet de ce
    // fichier, stubs neutres par défaut.
    listComptes: vi.fn().mockResolvedValue([]),
    createCompte: vi.fn(),
    deleteCompte: vi.fn(),
    getPreferences: vi.fn().mockResolvedValue({ methode_cout: 'cout_moyen_pondere', taux_imposition_pct: null }),
    updatePreferences: vi.fn(),
    listJobs: vi.fn().mockResolvedValue([]),
    // Déclaration de patrimoine (backlog 2.Q.2) : hors de l'objet des autres blocs
    // de ce fichier, stubs neutres par défaut.
    listHoldings: vi.fn().mockResolvedValue([]),
    listLoans: vi.fn().mockResolvedValue([]),
    downloadDeclarationPatrimoine: vi.fn(),
    // Sauvegarde complète (backlog X.6) : `SauvegardeDonneesCard` est montée dans
    // l'onglet Général — hors de l'objet de ce fichier, stubs neutres.
    downloadExportDonnees: vi.fn(),
    apercuImportDonnees: vi.fn(),
    importerDonnees: vi.fn(),
    listSessions: vi.fn().mockResolvedValue([]),
    getAccessLog: vi.fn().mockResolvedValue([]),
    listHouseholdMembers: vi.fn().mockResolvedValue([]),
    createHouseholdMember: vi.fn(),
    deleteHouseholdMember: vi.fn(),
    // Liens de partage (backlog 2.Q.1) : hors de l'objet des autres blocs de ce
    // fichier, stub neutre par défaut (aucun lien existant).
    listLiensPartage: vi.fn().mockResolvedValue([]),
    createLienPartage: vi.fn(),
    revokeLienPartage: vi.fn(),
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
    renderReglages()
    ouvrirOnglet('Détenteurs')

    await screen.findByText('Aucun détenteur déclaré.')
  })

  it('liste les détenteurs déclarés avec leur type', async () => {
    vi.mocked(api.listDetenteurs).mockResolvedValue([detenteur({ nom: 'Alice', type: 'personne' }), detenteur({ id: 2, nom: 'SCI Famille', type: 'societe' })])
    renderReglages()
    ouvrirOnglet('Détenteurs')

    await screen.findByText('Alice')
    expect(screen.getByText('SCI Famille')).toBeInTheDocument()
    expect(screen.getByText('(Personne)')).toBeInTheDocument()
    expect(screen.getByText('(Société)')).toBeInTheDocument()
  })

  it('ajouter un détenteur appelle createDetenteur puis recharge la liste', async () => {
    // Onglet "Détenteurs" isolé de "Comptes & sécurité" (`GestionFoyerCard`) : plus
    // qu'un seul consommateur de `listDetenteurs` monté à la fois, donc 2 valeurs
    // enfilées (chargement initial, puis rechargement après "Ajouter").
    vi.mocked(api.listDetenteurs).mockResolvedValueOnce([]).mockResolvedValue([detenteur({ nom: 'Bob' })])
    vi.mocked(api.createDetenteur).mockResolvedValue(detenteur({ nom: 'Bob' }))
    renderReglages()
    ouvrirOnglet('Détenteurs')
    await screen.findByText('Aucun détenteur déclaré.')

    const formulaire = screen.getByPlaceholderText('Alice').closest('form')!
    fireEvent.change(screen.getByPlaceholderText('Alice'), { target: { value: 'Bob' } })
    // Bouton "Ajouter" ambigu depuis l'ajout de `EtablissementsCard` dans le même
    // onglet (écran Comptes, backlog X.1) : on cible celui du formulaire détenteur.
    fireEvent.click(within(formulaire).getByRole('button', { name: 'Ajouter' }))

    await screen.findByText('Bob')
    expect(api.createDetenteur).toHaveBeenCalledWith('Bob', 'personne')
  })

  it('supprimer un détenteur appelle deleteDetenteur puis recharge la liste', async () => {
    vi.mocked(api.listDetenteurs).mockResolvedValueOnce([detenteur({ nom: 'Alice' })]).mockResolvedValue([])
    vi.mocked(api.deleteDetenteur).mockResolvedValue({ ok: true })
    renderReglages()
    ouvrirOnglet('Détenteurs')
    await screen.findByText('Alice')

    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }))

    await screen.findByText('Aucun détenteur déclaré.')
    expect(api.deleteDetenteur).toHaveBeenCalledWith(1)
  })

  it('Réessayer relance listDetenteurs après un échec', async () => {
    vi.mocked(api.listDetenteurs).mockRejectedValueOnce(new Error('panne détenteurs'))
    renderReglages()
    ouvrirOnglet('Détenteurs')
    await screen.findByText('panne détenteurs')

    vi.mocked(api.listDetenteurs).mockResolvedValue([detenteur({ nom: 'Alice' })])
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }))

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
    renderReglages()
    ouvrirOnglet('Comptes & sécurité')
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
    renderReglages()
    ouvrirOnglet('Comptes & sécurité')

    await screen.findByText('Paul Cartieri')
    expect(screen.getByText('· paul@example.com', { exact: false })).toBeInTheDocument()
    expect(screen.queryByText('paul.oidc')).not.toBeInTheDocument()
  })

  it('sans nom, affiche le username (comportement inchangé pour un compte mot de passe)', async () => {
    vi.mocked(api.listHouseholdMembers).mockResolvedValue([
      { id: 3, username: 'conjoint', role: 'membre', created_at: '2026-01-01T00:00:00', detenteur_ids: [] },
    ])
    renderReglages()
    ouvrirOnglet('Comptes & sécurité')

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
    renderReglages()
    ouvrirOnglet('SSO / OIDC')

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
    renderReglages()
    ouvrirOnglet('SSO / OIDC')
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
    renderReglages()
    ouvrirOnglet('SSO / OIDC')
    await screen.findByDisplayValue('https://sso.example.com')

    fireEvent.click(screen.getByRole('checkbox', { name: 'Activée' }))
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    await vi.waitFor(() => expect(api.updateOidcConfig).toHaveBeenCalledWith(expect.objectContaining({ enabled: false })))
  })

  it('un secret saisi est inclus dans updateOidcConfig', async () => {
    vi.mocked(api.getOidcConfig).mockResolvedValue(oidcConfig())
    vi.mocked(api.updateOidcConfig).mockResolvedValue(oidcConfig({ secret_configure: true }))
    renderReglages()
    ouvrirOnglet('SSO / OIDC')
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
    renderReglages()
    ouvrirOnglet('SSO / OIDC')
    await screen.findByDisplayValue('https://sso.example.com')

    fireEvent.change(screen.getByLabelText(/Claim → email/), { target: { value: 'mail' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    await vi.waitFor(() => expect(api.updateOidcConfig).toHaveBeenCalledWith(expect.objectContaining({ claim_email: 'mail' })))
  })

  it("affiche un avertissement si PATRIMOINE_SECRET_KEY n'est pas définie côté serveur", async () => {
    vi.mocked(api.getOidcConfig).mockResolvedValue(oidcConfig({ cle_chiffrement_definie: false }))
    renderReglages()
    ouvrirOnglet('SSO / OIDC')

    await screen.findByText(/PATRIMOINE_SECRET_KEY/)
  })
})

function lienPartage(overrides: Partial<import('../api/types').LienPartage> = {}): import('../api/types').LienPartage {
  return {
    id: 1,
    token: 'a'.repeat(64),
    nom: 'Pour la banque',
    detenteur_id: null,
    inclure_patrimoine_net: true,
    inclure_repartition: true,
    inclure_performance: true,
    inclure_budget: false,
    inclure_objectifs: false,
    masquer_valeurs: false,
    code_requis: false,
    created_at: '2026-01-01T00:00:00',
    expires_at: '2099-01-01T00:00:00',
    revoked_at: null,
    ...overrides,
  }
}

describe('ReglagesPage — Liens de partage (backlog 2.Q.1)', () => {
  it("affiche un message quand aucun lien n'est créé", async () => {
    vi.mocked(api.listLiensPartage).mockResolvedValue([])
    renderReglages()
    ouvrirOnglet('Partage')

    await screen.findByText('Aucun lien de partage créé.')
  })

  it('liste les liens existants avec leur URL publique', async () => {
    vi.mocked(api.listLiensPartage).mockResolvedValue([lienPartage()])
    renderReglages()
    ouvrirOnglet('Partage')

    await screen.findByText('Pour la banque')
    expect(screen.getByDisplayValue(`http://localhost:3000/partage/${'a'.repeat(64)}`)).toBeInTheDocument()
  })

  it('un lien révoqué affiche le badge « révoqué » sans URL ni bouton Révoquer', async () => {
    vi.mocked(api.listLiensPartage).mockResolvedValue([lienPartage({ revoked_at: '2026-01-02T00:00:00' })])
    renderReglages()
    ouvrirOnglet('Partage')

    await screen.findByText('révoqué')
    expect(screen.queryByRole('button', { name: 'Révoquer' })).not.toBeInTheDocument()
  })

  it('un lien avec code requis affiche le badge correspondant', async () => {
    vi.mocked(api.listLiensPartage).mockResolvedValue([lienPartage({ code_requis: true })])
    renderReglages()
    ouvrirOnglet('Partage')

    await screen.findByText('code requis')
  })

  it('créer un lien appelle createLienPartage avec les sections cochées puis recharge la liste', async () => {
    vi.mocked(api.listLiensPartage).mockResolvedValueOnce([]).mockResolvedValue([lienPartage()])
    vi.mocked(api.createLienPartage).mockResolvedValue(lienPartage())
    renderReglages()
    ouvrirOnglet('Partage')
    await screen.findByText('Aucun lien de partage créé.')

    fireEvent.change(screen.getByPlaceholderText('Pour la banque'), { target: { value: 'Pour la banque' } })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Budget' }))
    fireEvent.click(screen.getByRole('button', { name: 'Créer le lien' }))

    await vi.waitFor(() =>
      expect(api.createLienPartage).toHaveBeenCalledWith(
        expect.objectContaining({ nom: 'Pour la banque', inclure_budget: true, detenteur_id: null, code: null }),
      ),
    )
  })

  it('révoquer un lien appelle revokeLienPartage puis recharge la liste', async () => {
    vi.mocked(api.listLiensPartage).mockResolvedValueOnce([lienPartage()]).mockResolvedValue([lienPartage({ revoked_at: '2026-01-02T00:00:00' })])
    vi.mocked(api.revokeLienPartage).mockResolvedValue(undefined)
    renderReglages()
    ouvrirOnglet('Partage')
    await screen.findByText('Pour la banque')

    fireEvent.click(screen.getByRole('button', { name: 'Révoquer' }))

    await vi.waitFor(() => expect(api.revokeLienPartage).toHaveBeenCalledWith(1))
    await screen.findByText('révoqué')
  })
})

function holdingDeclaration(overrides: Partial<import('../api/types').Holding> = {}): import('../api/types').Holding {
  return {
    id: 1,
    ticker: 'AAA',
    nom: 'Action A',
    quantite: 10,
    prix_revient_moyen: 100,
    compte: null,
    devise: 'EUR',
    type_actif: 'STOCK',
    origine: 'manuel',
    created_at: '2026-01-01T00:00:00',
    updated_at: '2026-01-01T00:00:00',
    market_data: null,
    rendement_depuis_achat_pct: null,
    rendement_annualise_pct: null,
    valeur: 1000,
    valeur_estimee: null,
    date_valeur_estimee: null,
    taux_pct: null,
    zone_geo: null,
    versement_mensuel: null,
    date_acquisition: null,
    ...overrides,
  }
}

function loanDeclaration(overrides: Partial<import('../api/types').Loan> = {}): import('../api/types').Loan {
  return {
    id: 1,
    libelle: 'Crédit immo',
    capital_initial: 200000,
    taux_annuel_pct: 1.5,
    mensualite: 1000,
    date_debut: '2020-01-01T00:00:00',
    duree_mois: 200,
    capital_restant_du_manuel: null,
    derniere_maj_manuelle: null,
    holding_id: null,
    etablissement_id: null,
    capital_restant_du: 150000,
    created_at: '2020-01-01T00:00:00',
    updated_at: '2020-01-01T00:00:00',
    ...overrides,
  }
}

describe('ReglagesPage — Déclaration de patrimoine (backlog 2.Q.2)', () => {
  beforeEach(() => {
    vi.stubGlobal('URL', { createObjectURL: vi.fn().mockReturnValue('blob:fake'), revokeObjectURL: vi.fn() })
  })

  it('ouvre la modale et liste les actifs et emprunts, tous cochés par défaut', async () => {
    vi.mocked(api.listHoldings).mockResolvedValue([holdingDeclaration()])
    vi.mocked(api.listLoans).mockResolvedValue([loanDeclaration()])
    renderReglages()

    fireEvent.click(await screen.findByRole('button', { name: 'Déclaration de patrimoine (PDF)' }))

    await screen.findByRole('dialog')
    expect(screen.getByText('Action A')).toBeInTheDocument()
    expect(screen.getByText('Crédit immo')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /Action A/ })).toBeChecked()
  })

  it('générer le PDF appelle downloadDeclarationPatrimoine avec la sélection par défaut', async () => {
    vi.mocked(api.listHoldings).mockResolvedValue([holdingDeclaration()])
    vi.mocked(api.listLoans).mockResolvedValue([loanDeclaration()])
    vi.mocked(api.downloadDeclarationPatrimoine).mockResolvedValue(new Blob(['%PDF'], { type: 'application/pdf' }))
    renderReglages()

    fireEvent.click(await screen.findByRole('button', { name: 'Déclaration de patrimoine (PDF)' }))
    await screen.findByRole('dialog')
    fireEvent.click(screen.getByRole('button', { name: 'Générer le PDF' }))

    await vi.waitFor(() =>
      expect(api.downloadDeclarationPatrimoine).toHaveBeenCalledWith(
        expect.objectContaining({ holding_ids: [1], loan_ids: [1], detenteur_id: null, inclure_profil: false }),
      ),
    )
  })

  it('décocher un actif le retire de la sélection envoyée', async () => {
    vi.mocked(api.listHoldings).mockResolvedValue([holdingDeclaration()])
    vi.mocked(api.listLoans).mockResolvedValue([])
    vi.mocked(api.downloadDeclarationPatrimoine).mockResolvedValue(new Blob(['%PDF'], { type: 'application/pdf' }))
    renderReglages()

    fireEvent.click(await screen.findByRole('button', { name: 'Déclaration de patrimoine (PDF)' }))
    await screen.findByRole('dialog')
    fireEvent.click(screen.getByRole('checkbox', { name: /Action A/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Générer le PDF' }))

    await vi.waitFor(() => expect(api.downloadDeclarationPatrimoine).toHaveBeenCalledWith(expect.objectContaining({ holding_ids: [] })))
  })

  it("affiche un message d'erreur si la génération échoue, sans fermer la modale", async () => {
    vi.mocked(api.listHoldings).mockResolvedValue([])
    vi.mocked(api.listLoans).mockResolvedValue([])
    vi.mocked(api.downloadDeclarationPatrimoine).mockRejectedValue(new Error('Détenteur introuvable'))
    renderReglages()

    fireEvent.click(await screen.findByRole('button', { name: 'Déclaration de patrimoine (PDF)' }))
    await screen.findByRole('dialog')
    fireEvent.click(screen.getByRole('button', { name: 'Générer le PDF' }))

    await screen.findByText('Détenteur introuvable')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})

describe('ReglagesPage — Assistant de bienvenue (welcome board)', () => {
  it('un propriétaire voit le bouton "Revoir l\'assistant de bienvenue", qui ouvre l\'assistant', async () => {
    renderReglages()

    const bouton = await screen.findByRole('button', { name: "Revoir l'assistant de bienvenue" })
    fireEvent.click(bouton)

    expect(await screen.findByRole('heading', { name: 'Configuration initiale' })).toBeInTheDocument()
  })

  it('un membre du foyer ne voit pas le bouton (réservé au propriétaire)', async () => {
    render(
      <MemoryRouter>
        <AuthContext.Provider value={{ ...utilisateurFactice, user: { ...utilisateurFactice.user!, role: 'membre' } }}>
          <ReglagesPage />
        </AuthContext.Provider>
      </MemoryRouter>,
    )
    ouvrirOnglet('Général')

    await screen.findByText('Méthode de calcul du coût de revient')
    expect(screen.queryByRole('button', { name: "Revoir l'assistant de bienvenue" })).not.toBeInTheDocument()
  })

  it('"Terminer" referme l\'assistant sans rouvrir le drapeau déjà acquis (pure relecture)', async () => {
    const completeOnboarding = vi.fn()
    render(
      <MemoryRouter>
        <AuthContext.Provider value={{ ...utilisateurFactice, completeOnboarding }}>
          <ReglagesPage />
        </AuthContext.Provider>
      </MemoryRouter>,
    )

    fireEvent.click(await screen.findByRole('button', { name: "Revoir l'assistant de bienvenue" }))
    await screen.findByRole('heading', { name: 'Configuration initiale' })
    // Navigue jusqu'à la dernière étape avant de terminer — nombre d'étapes lu
    // dynamiquement (`ETAPES_ONBOARDING`), pour ne jamais se désynchroniser d'un
    // ajout/retrait d'étape (même patron que `WelcomeWizard.test.tsx`).
    for (let i = 0; i < ETAPES_ONBOARDING.length - 1; i++) fireEvent.click(screen.getByRole('button', { name: 'Suivant' }))
    fireEvent.click(screen.getByRole('button', { name: 'Terminer' }))

    await vi.waitFor(() => expect(screen.queryByRole('heading', { name: 'Configuration initiale' })).not.toBeInTheDocument())
    expect(completeOnboarding).not.toHaveBeenCalled()
  })
})
