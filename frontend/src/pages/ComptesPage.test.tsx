import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../api/client'
import type { Compte, CompteAvecSolde, Etablissement } from '../api/types'
import ComptesPage from './ComptesPage'

vi.mock('../api/client', () => ({
  api: {
    listComptesAvecSolde: vi.fn(),
    listEtablissements: vi.fn(),
    // Établissement requis à la création d'un compte (revue du 03/09/2026,
    // compte/établissement obligatoires) — `EtablissementsCard`, relocalisée sur
    // cet écran, et `AjoutCompteForm` (« + Nouvel établissement... ») en ont
    // désormais besoin.
    createEtablissement: vi.fn(),
    updateEtablissement: vi.fn(),
    deleteEtablissement: vi.fn(),
    createCompte: vi.fn(),
    deleteCompte: vi.fn(),
  },
}))

// Contrôles transverses (backlog 2.K.3) : `ComptesPage` lit
// `usePreferencesAffichage()` (montants masqués) — non testé ici, stub neutre.
vi.mock('../hooks/usePreferencesAffichage', () => ({
  usePreferencesAffichage: () => ({ lentille: 'net', setLentille: vi.fn(), montantsMasques: false, toggleMontantsMasques: vi.fn() }),
}))

// La fiche détaillée (modale) n'est pas l'objet de ce fichier : mise de côté pour ne
// vérifier que son ouverture (clic sur un compte), même patron que
// `PortefeuillePage.test.tsx`/`HoldingDetailModal`.
vi.mock('../components/CompteDetailModal', () => ({
  default: ({ compteId }: { compteId: number }) => <div data-testid="modale-detail">{compteId}</div>,
}))

function etablissement(overrides: Partial<Etablissement> = {}): Etablissement {
  return { id: 1, nom: 'Banque Test', created_at: '2026-01-01T00:00:00', updated_at: '2026-01-01T00:00:00', ...overrides }
}

function compte(overrides: Partial<Compte> = {}): Compte {
  return {
    id: 1,
    nom: 'PEA',
    etablissement: null,
    created_at: '2026-01-01T00:00:00',
    updated_at: '2026-01-01T00:00:00',
    ...overrides,
  }
}

function ligne(overrides: Partial<CompteAvecSolde> = {}): CompteAvecSolde {
  return { compte: compte(), solde: 1000, nombre_lignes: 2, ...overrides }
}

describe('ComptesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.listEtablissements).mockResolvedValue([])
  })

  it("affiche un état vide quand aucun compte n'est déclaré", async () => {
    vi.mocked(api.listComptesAvecSolde).mockResolvedValue([])
    render(<ComptesPage />)

    await screen.findByText('Aucun compte déclaré.')
  })

  it('groupe les comptes par établissement, avec un total du foyer en tête', async () => {
    const banque = etablissement({ id: 1, nom: 'Banque Test' })
    vi.mocked(api.listComptesAvecSolde).mockResolvedValue([
      ligne({ compte: compte({ id: 1, nom: 'PEA', etablissement: banque }), solde: 1000 }),
      ligne({ compte: compte({ id: 2, nom: 'Livret A', etablissement: null }), solde: 500, nombre_lignes: 1 }),
    ])
    render(<ComptesPage />)

    await screen.findByText('Banque Test')
    expect(screen.getByText('PEA')).toBeInTheDocument()
    expect(screen.getByText('Sans établissement')).toBeInTheDocument()
    expect(screen.getByText('Livret A')).toBeInTheDocument()
    // Total du foyer (1000 + 500), affiché en tête d'écran.
    expect(screen.getByText('1 500 €')).toBeInTheDocument()
  })

  it('le bucket "Sans compte" (compte === null) est affiché mais non cliquable', async () => {
    vi.mocked(api.listComptesAvecSolde).mockResolvedValue([ligne({ compte: null, solde: 250, nombre_lignes: 3 })])
    render(<ComptesPage />)

    await screen.findByText('Sans compte')
    expect(screen.queryByRole('button', { name: /Sans compte/ })).not.toBeInTheDocument()
  })

  it('créer un compte appelle createCompte puis recharge la liste', async () => {
    const etablissement: Etablissement = { id: 7, nom: 'Boursorama', created_at: '2026-01-01T00:00:00', updated_at: '2026-01-01T00:00:00' }
    vi.mocked(api.listComptesAvecSolde).mockResolvedValueOnce([]).mockResolvedValue([ligne({ compte: compte({ nom: 'Nouveau CTO' }) })])
    // Établissement obligatoire à la création (revue du 03/09/2026) — existant ici
    // (contrairement à `EpargnePage.test.tsx`), choisi directement dans la liste.
    vi.mocked(api.listEtablissements).mockResolvedValue([etablissement])
    vi.mocked(api.createCompte).mockResolvedValue(compte({ nom: 'Nouveau CTO', etablissement }))
    render(<ComptesPage />)
    await screen.findByText('Aucun compte déclaré.')

    fireEvent.change(screen.getByPlaceholderText('PEA, Livret A...'), { target: { value: 'Nouveau CTO' } })
    fireEvent.change(screen.getByLabelText('Établissement'), { target: { value: '7' } })
    fireEvent.click(screen.getByRole('button', { name: '+ Nouveau compte' }))

    await screen.findByText('Nouveau CTO')
    expect(api.createCompte).toHaveBeenCalledWith('Nouveau CTO', 7)
  })

  it('cliquer un compte ouvre la fiche détaillée (modale)', async () => {
    vi.mocked(api.listComptesAvecSolde).mockResolvedValue([ligne({ compte: compte({ id: 42, nom: 'PEA' }) })])
    render(<ComptesPage />)
    await screen.findByText('PEA')

    fireEvent.click(screen.getByText('PEA'))

    const modale = await screen.findByTestId('modale-detail')
    expect(modale).toHaveTextContent('42')
  })

  it('supprimer un compte demande confirmation avant d\'appeler deleteCompte', async () => {
    vi.mocked(api.listComptesAvecSolde).mockResolvedValueOnce([ligne({ compte: compte({ id: 42, nom: 'PEA' }) })]).mockResolvedValue([])
    vi.mocked(api.deleteCompte).mockResolvedValue({ ok: true })
    render(<ComptesPage />)
    await screen.findByText('PEA')

    // Le libellé accessible NOMME le compte (audit de design du 03/09/2026) :
    // trois boutons « Supprimer » cohabitaient sur un même écran, indiscernables
    // pour un lecteur d'écran. Ce test le verrouille au passage.
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer le compte PEA' }))

    // Rien n'est supprimé tant que la confirmation n'est pas validée.
    const modale = await screen.findByRole('dialog')
    expect(api.deleteCompte).not.toHaveBeenCalled()
    // La modale rassure sur le sort des lignes rattachées (elles ne disparaissent pas).
    expect(within(modale).getByText(/ne sont pas supprimées/)).toBeInTheDocument()
    // Le clic sur "Supprimer" n'a jamais ouvert la modale de DÉTAIL (stopPropagation).
    expect(screen.queryByTestId('modale-detail')).not.toBeInTheDocument()

    fireEvent.click(within(modale).getByRole('button', { name: 'Supprimer' }))

    await screen.findByText('Aucun compte déclaré.')
    expect(api.deleteCompte).toHaveBeenCalledWith(42)
  })

  it('annuler la confirmation ne supprime rien', async () => {
    vi.mocked(api.listComptesAvecSolde).mockResolvedValue([ligne({ compte: compte({ id: 42, nom: 'PEA' }) })])
    render(<ComptesPage />)
    await screen.findByText('PEA')

    // Le libellé accessible NOMME le compte (audit de design du 03/09/2026) :
    // trois boutons « Supprimer » cohabitaient sur un même écran, indiscernables
    // pour un lecteur d'écran. Ce test le verrouille au passage.
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer le compte PEA' }))
    const modale = await screen.findByRole('dialog')
    fireEvent.click(within(modale).getByRole('button', { name: 'Annuler' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(api.deleteCompte).not.toHaveBeenCalled()
    expect(screen.getByText('PEA')).toBeInTheDocument()
  })
})
