import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../api/client'
import type { Etablissement } from '../api/types'
import EtablissementsCard from './EtablissementsCard'

vi.mock('../api/client', () => ({
  api: {
    listEtablissements: vi.fn(),
    createEtablissement: vi.fn(),
    updateEtablissement: vi.fn(),
    deleteEtablissement: vi.fn(),
  },
}))

function etablissement(overrides: Partial<Etablissement> = {}): Etablissement {
  return {
    id: 1,
    nom: 'Caisse d\'Épargne',
    created_at: '2026-01-01T00:00:00',
    updated_at: '2026-01-01T00:00:00',
    ...overrides,
  }
}

describe('EtablissementsCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("affiche un message quand aucun établissement n'est déclaré", async () => {
    vi.mocked(api.listEtablissements).mockResolvedValue([])
    render(<EtablissementsCard />)

    await screen.findByText('Aucun établissement déclaré.')
  })

  it('liste les établissements déclarés', async () => {
    vi.mocked(api.listEtablissements).mockResolvedValue([etablissement(), etablissement({ id: 2, nom: 'Boursorama' })])
    render(<EtablissementsCard />)

    await screen.findByText("Caisse d'Épargne")
    expect(screen.getByText('Boursorama')).toBeInTheDocument()
  })

  it('ajouter un établissement appelle createEtablissement puis recharge la liste', async () => {
    vi.mocked(api.listEtablissements).mockResolvedValueOnce([]).mockResolvedValue([etablissement({ nom: 'Boursorama' })])
    vi.mocked(api.createEtablissement).mockResolvedValue(etablissement({ nom: 'Boursorama' }))
    render(<EtablissementsCard />)
    await screen.findByText('Aucun établissement déclaré.')

    fireEvent.change(screen.getByPlaceholderText("Caisse d'Épargne"), { target: { value: 'Boursorama' } })
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter' }))

    await screen.findByText('Boursorama')
    expect(api.createEtablissement).toHaveBeenCalledWith('Boursorama')
  })

  it('Modifier bascule en édition inline, Enregistrer appelle updateEtablissement puis recharge la liste', async () => {
    vi.mocked(api.listEtablissements).mockResolvedValueOnce([etablissement()]).mockResolvedValue([etablissement({ nom: 'Caisse Nouveau Nom' })])
    vi.mocked(api.updateEtablissement).mockResolvedValue(etablissement({ nom: 'Caisse Nouveau Nom' }))
    render(<EtablissementsCard />)
    await screen.findByText("Caisse d'Épargne")

    fireEvent.click(screen.getByRole('button', { name: 'Modifier' }))
    const champEdition = screen.getByLabelText('Nom (édition)')
    expect(champEdition).toHaveValue("Caisse d'Épargne")

    fireEvent.change(champEdition, { target: { value: 'Caisse Nouveau Nom' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    await screen.findByText('Caisse Nouveau Nom')
    expect(api.updateEtablissement).toHaveBeenCalledWith(1, 'Caisse Nouveau Nom')
    expect(screen.queryByLabelText('Nom (édition)')).not.toBeInTheDocument()
  })

  it("Annuler ferme l'édition sans appeler updateEtablissement", async () => {
    vi.mocked(api.listEtablissements).mockResolvedValue([etablissement()])
    render(<EtablissementsCard />)
    await screen.findByText("Caisse d'Épargne")

    fireEvent.click(screen.getByRole('button', { name: 'Modifier' }))
    fireEvent.change(screen.getByLabelText('Nom (édition)'), { target: { value: 'Autre chose' } })
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }))

    expect(screen.queryByLabelText('Nom (édition)')).not.toBeInTheDocument()
    expect(screen.getByText("Caisse d'Épargne")).toBeInTheDocument()
    expect(api.updateEtablissement).not.toHaveBeenCalled()
  })

  it('supprimer un établissement appelle deleteEtablissement puis recharge la liste', async () => {
    vi.mocked(api.listEtablissements).mockResolvedValueOnce([etablissement()]).mockResolvedValue([])
    vi.mocked(api.deleteEtablissement).mockResolvedValue({ ok: true })
    render(<EtablissementsCard />)
    await screen.findByText("Caisse d'Épargne")

    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }))

    await screen.findByText('Aucun établissement déclaré.')
    expect(api.deleteEtablissement).toHaveBeenCalledWith(1)
  })
})
