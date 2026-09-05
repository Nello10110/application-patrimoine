import { fireEvent, render, screen, within } from '@testing-library/react'
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
    logo_key: null,
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
    vi.mocked(api.listEtablissements).mockResolvedValue([etablissement(), etablissement({ id: 2, nom: 'Fortuneo' })])
    render(<EtablissementsCard />)

    const liste = await screen.findByRole('list')
    expect(within(liste).getByText("Caisse d'Épargne")).toBeInTheDocument()
    expect(within(liste).getByText('Fortuneo')).toBeInTheDocument()
  })

  it('ajouter un établissement appelle createEtablissement puis recharge la liste', async () => {
    vi.mocked(api.listEtablissements).mockResolvedValueOnce([]).mockResolvedValue([etablissement({ nom: 'Ma banque perso' })])
    vi.mocked(api.createEtablissement).mockResolvedValue(etablissement({ nom: 'Ma banque perso' }))
    render(<EtablissementsCard />)
    await screen.findByText('Aucun établissement déclaré.')

    fireEvent.change(screen.getByPlaceholderText("Caisse d'Épargne"), { target: { value: 'Ma banque perso' } })
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter' }))

    const liste = await screen.findByRole('list')
    expect(within(liste).getByText('Ma banque perso')).toBeInTheDocument()
    expect(api.createEtablissement).toHaveBeenCalledWith('Ma banque perso', null)
  })

  it('choisir un établissement connu dans le catalogue préremplit le nom et transmet sa clé de logo', async () => {
    vi.mocked(api.listEtablissements).mockResolvedValueOnce([]).mockResolvedValue([etablissement({ nom: 'Boursorama Banque', logo_key: 'boursorama' })])
    vi.mocked(api.createEtablissement).mockResolvedValue(etablissement({ nom: 'Boursorama Banque', logo_key: 'boursorama' }))
    render(<EtablissementsCard />)
    await screen.findByText('Aucun établissement déclaré.')

    fireEvent.click(screen.getByRole('button', { name: /Boursorama Banque/ }))
    expect(screen.getByPlaceholderText("Caisse d'Épargne")).toHaveValue('Boursorama Banque')

    fireEvent.click(screen.getByRole('button', { name: 'Ajouter' }))

    expect(api.createEtablissement).toHaveBeenCalledWith('Boursorama Banque', 'boursorama')
  })

  it('Modifier bascule en édition inline, Enregistrer appelle updateEtablissement puis recharge la liste', async () => {
    vi.mocked(api.listEtablissements).mockResolvedValueOnce([etablissement()]).mockResolvedValue([etablissement({ nom: 'Caisse Nouveau Nom' })])
    vi.mocked(api.updateEtablissement).mockResolvedValue(etablissement({ nom: 'Caisse Nouveau Nom' }))
    render(<EtablissementsCard />)
    const liste = await screen.findByRole('list')
    expect(within(liste).getByText("Caisse d'Épargne")).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Modifier' }))
    const champEdition = screen.getByLabelText('Nom (édition)')
    expect(champEdition).toHaveValue("Caisse d'Épargne")

    fireEvent.change(champEdition, { target: { value: 'Caisse Nouveau Nom' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    await within(await screen.findByRole('list')).findByText('Caisse Nouveau Nom')
    expect(api.updateEtablissement).toHaveBeenCalledWith(1, 'Caisse Nouveau Nom')
    expect(screen.queryByLabelText('Nom (édition)')).not.toBeInTheDocument()
  })

  it("Annuler ferme l'édition sans appeler updateEtablissement", async () => {
    vi.mocked(api.listEtablissements).mockResolvedValue([etablissement()])
    render(<EtablissementsCard />)
    const liste = await screen.findByRole('list')
    await within(liste).findByText("Caisse d'Épargne")

    fireEvent.click(screen.getByRole('button', { name: 'Modifier' }))
    fireEvent.change(screen.getByLabelText('Nom (édition)'), { target: { value: 'Autre chose' } })
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }))

    expect(screen.queryByLabelText('Nom (édition)')).not.toBeInTheDocument()
    expect(within(liste).getByText("Caisse d'Épargne")).toBeInTheDocument()
    expect(api.updateEtablissement).not.toHaveBeenCalled()
  })

  it('supprimer un établissement appelle deleteEtablissement puis recharge la liste', async () => {
    vi.mocked(api.listEtablissements).mockResolvedValueOnce([etablissement()]).mockResolvedValue([])
    vi.mocked(api.deleteEtablissement).mockResolvedValue({ ok: true })
    render(<EtablissementsCard />)
    const liste = await screen.findByRole('list')
    await within(liste).findByText("Caisse d'Épargne")

    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }))

    await screen.findByText('Aucun établissement déclaré.')
    expect(api.deleteEtablissement).toHaveBeenCalledWith(1)
  })
})
