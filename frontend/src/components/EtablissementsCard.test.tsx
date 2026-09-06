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
    // Logos réels (retour utilisateur, 05/09/2026) : chargés une fois par
    // `utils/logosEtablissements.ts` dès qu'un badge est monté, et sollicités par la
    // vue d'édition dédiée.
    getLogosEtablissements: vi.fn().mockResolvedValue({}),
    recupererLogoCatalogue: vi.fn(),
    setEtablissementLogoUrl: vi.fn(),
    uploadEtablissementLogo: vi.fn(),
    deleteEtablissementLogo: vi.fn(),
  },
}))

function etablissement(overrides: Partial<Etablissement> = {}): Etablissement {
  return {
    id: 1,
    nom: 'Caisse d\'Épargne',
    logo_key: null,
    a_un_logo: false,
    logo_source: null,
    logo_maj_le: null,
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

  it('choisir un établissement connu dans le catalogue préremplit le nom, transmet sa clé et récupère aussitôt son logo officiel', async () => {
    const cree = etablissement({ nom: 'Boursorama Banque', logo_key: 'boursorama' })
    vi.mocked(api.listEtablissements).mockResolvedValueOnce([]).mockResolvedValue([cree])
    vi.mocked(api.createEtablissement).mockResolvedValue(cree)
    vi.mocked(api.recupererLogoCatalogue).mockResolvedValue({ ...cree, a_un_logo: true, logo_source: 'catalogue' })
    render(<EtablissementsCard />)
    await screen.findByText('Aucun établissement déclaré.')

    fireEvent.click(screen.getByRole('button', { name: /Boursorama Banque/ }))
    expect(screen.getByPlaceholderText("Caisse d'Épargne")).toHaveValue('Boursorama Banque')

    fireEvent.click(screen.getByRole('button', { name: 'Ajouter' }))

    expect(api.createEtablissement).toHaveBeenCalledWith('Boursorama Banque', 'boursorama')
    // Le logo officiel est récupéré dans la foulée (retour utilisateur du
    // 05/09/2026 : « cherché et mis en cache automatiquement »), sans attendre le
    // job hebdomadaire.
    await vi.waitFor(() => expect(api.recupererLogoCatalogue).toHaveBeenCalledWith(cree.id))
  })

  it("l'échec de la récupération du logo à la création ne fait pas échouer la création", async () => {
    const cree = etablissement({ nom: 'Boursorama Banque', logo_key: 'boursorama' })
    vi.mocked(api.listEtablissements).mockResolvedValueOnce([]).mockResolvedValue([cree])
    vi.mocked(api.createEtablissement).mockResolvedValue(cree)
    vi.mocked(api.recupererLogoCatalogue).mockRejectedValue(new Error('site injoignable'))
    render(<EtablissementsCard />)
    await screen.findByText('Aucun établissement déclaré.')

    fireEvent.click(screen.getByRole('button', { name: /Boursorama Banque/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter' }))

    const liste = await screen.findByRole('list')
    expect(within(liste).getByText('Boursorama Banque')).toBeInTheDocument()
    expect(screen.queryByText('site injoignable')).not.toBeInTheDocument()
  })

  it("Modifier ouvre la vue d'édition dédiée, où Renommer appelle updateEtablissement", async () => {
    // Édition en modale depuis le 05/09/2026 (retour utilisateur : « une vue dédiée
    // où on pourrait aller mettre l'image ou l'URL ») — le renommage en ligne
    // d'avant ne pouvait pas accueillir la gestion du logo.
    vi.mocked(api.listEtablissements).mockResolvedValueOnce([etablissement()]).mockResolvedValue([etablissement({ nom: 'Caisse Nouveau Nom' })])
    vi.mocked(api.updateEtablissement).mockResolvedValue(etablissement({ nom: 'Caisse Nouveau Nom' }))
    render(<EtablissementsCard />)
    const liste = await screen.findByRole('list')
    expect(within(liste).getByText("Caisse d'Épargne")).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Modifier' }))
    const modale = await screen.findByRole('dialog')
    const champNom = within(modale).getByLabelText('Nom')
    expect(champNom).toHaveValue("Caisse d'Épargne")

    fireEvent.change(champNom, { target: { value: 'Caisse Nouveau Nom' } })
    fireEvent.click(within(modale).getByRole('button', { name: 'Renommer' }))

    await vi.waitFor(() => expect(api.updateEtablissement).toHaveBeenCalledWith(1, 'Caisse Nouveau Nom'))
  })

  it("fermer la vue d'édition sans rien changer n'appelle pas updateEtablissement", async () => {
    vi.mocked(api.listEtablissements).mockResolvedValue([etablissement()])
    render(<EtablissementsCard />)
    const liste = await screen.findByRole('list')
    await within(liste).findByText("Caisse d'Épargne")

    fireEvent.click(screen.getByRole('button', { name: 'Modifier' }))
    const modale = await screen.findByRole('dialog')
    fireEvent.click(within(modale).getByRole('button', { name: 'Fermer' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
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
