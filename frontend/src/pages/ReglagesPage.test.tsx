import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { api } from '../api/client'
import type { Detenteur } from '../api/types'
import ReglagesPage from './ReglagesPage'

// Ce fichier ne verrouille que la section "Personnes et sociétés" (backlog 2.L.1) —
// le reste de la page (préférences, tâches planifiées, export) est hors de son objet.
vi.mock('../api/client', () => ({
  api: {
    listDetenteurs: vi.fn(),
    createDetenteur: vi.fn(),
    deleteDetenteur: vi.fn(),
    getPreferences: vi.fn().mockResolvedValue({ methode_cout: 'cout_moyen_pondere', seuil_alerte_ecart_pct: 5 }),
    listJobs: vi.fn().mockResolvedValue([]),
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
    vi.mocked(api.listDetenteurs).mockResolvedValueOnce([]).mockResolvedValueOnce([detenteur({ nom: 'Bob' })])
    vi.mocked(api.createDetenteur).mockResolvedValue(detenteur({ nom: 'Bob' }))
    render(<ReglagesPage />)
    await screen.findByText('Aucun détenteur déclaré.')

    fireEvent.change(screen.getByPlaceholderText('Alice'), { target: { value: 'Bob' } })
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter' }))

    await screen.findByText('Bob')
    expect(api.createDetenteur).toHaveBeenCalledWith('Bob', 'personne')
  })

  it('supprimer un détenteur appelle deleteDetenteur puis recharge la liste', async () => {
    vi.mocked(api.listDetenteurs).mockResolvedValueOnce([detenteur({ nom: 'Alice' })]).mockResolvedValueOnce([])
    vi.mocked(api.deleteDetenteur).mockResolvedValue({ ok: true })
    render(<ReglagesPage />)
    await screen.findByText('Alice')

    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }))

    await screen.findByText('Aucun détenteur déclaré.')
    expect(api.deleteDetenteur).toHaveBeenCalledWith(1)
  })
})
