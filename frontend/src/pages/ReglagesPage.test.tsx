import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { api } from '../api/client'
import type { Detenteur, Session } from '../api/types'
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
