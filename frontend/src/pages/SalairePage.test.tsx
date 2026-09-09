import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../api/client'
import type { SalaireDonnees, SalaireResume, SyntheseAnnee } from '../api/types'
import SalairePage from './SalairePage'

vi.mock('../api/client', () => ({
  api: {
    getSalaires: vi.fn(),
    createSalaire: vi.fn(),
    updateSalaire: vi.fn(),
    deleteSalaire: vi.fn(),
    listDetenteurs: vi.fn(),
    createDetenteur: vi.fn(),
  },
}))

vi.mock('../hooks/usePreferencesAffichage', () => ({
  usePreferencesAffichage: () => ({ montantsMasques: false }),
}))

const ANNEE = new Date().getFullYear()

function entree(overrides: Partial<SalaireResume> = {}): SalaireResume {
  return {
    id: 1,
    annee: ANNEE,
    nom: 'Salaire principal',
    montant: 3000,
    type_montant: 'brut',
    periodicite: 'mensuel',
    statut: 'cadre',
    nombre_mois: 12,
    taux_imposition_pct: null,
    detenteur_id: null,
    detenteur_nom: null,
    brut_annuel: 36000,
    brut_mensuel_moyen: 3000,
    brut_par_versement: 3000,
    net_avant_impot_annuel: 27000,
    net_avant_impot_mensuel_moyen: 2250,
    net_avant_impot_par_versement: 2250,
    net_apres_impot_annuel: null,
    net_apres_impot_mensuel_moyen: null,
    ...overrides,
  }
}

function synthese(overrides: Partial<SyntheseAnnee> = {}): SyntheseAnnee {
  return {
    annee: ANNEE,
    nombre_salaires: 1,
    net_total_annuel: 27000,
    toutes_les_entrees_ont_un_taux_imposition: true,
    montant_investi_annee: 2700,
    taux_epargne_pct: 10,
    ...overrides,
  }
}

function donnees(overrides: Partial<SalaireDonnees> = {}): SalaireDonnees {
  return { entrees: [], syntheses: [], ...overrides }
}

describe('SalairePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.listDetenteurs).mockResolvedValue([])
  })

  it("affiche un état vide quand aucun salaire n'est encore enregistré", async () => {
    vi.mocked(api.getSalaires).mockResolvedValue(donnees())

    render(<SalairePage />)

    await screen.findByText(/Aucun salaire enregistré pour cette année/)
    await screen.findByText(/Aucun salaire enregistré pour l'instant/)
  })

  it('affiche une erreur avec un bouton Réessayer si le chargement échoue', async () => {
    vi.mocked(api.getSalaires).mockRejectedValue(new Error('Panne réseau'))

    render(<SalairePage />)

    await screen.findByText('Panne réseau')
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeInTheDocument()
  })

  it('affiche les salaires existants avec leurs chiffres', async () => {
    vi.mocked(api.getSalaires).mockResolvedValue(donnees({ entrees: [entree()], syntheses: [synthese()] }))

    render(<SalairePage />)

    await screen.findByText('Salaire principal')
    expect(screen.getByText(/36 000/)).toBeInTheDocument()
  })

  it('ajoute un nouveau salaire via le formulaire', async () => {
    vi.mocked(api.getSalaires)
      .mockResolvedValueOnce(donnees())
      .mockResolvedValueOnce(donnees({ entrees: [entree()], syntheses: [synthese()] }))
    vi.mocked(api.createSalaire).mockResolvedValue(entree())

    render(<SalairePage />)
    await screen.findByText(/Aucun salaire enregistré pour cette année/)

    fireEvent.click(screen.getByRole('button', { name: '+ Ajouter un salaire' }))
    fireEvent.change(screen.getByPlaceholderText('ex. Salaire de Paul'), { target: { value: 'Salaire de Julie' } })
    fireEvent.change(screen.getByPlaceholderText('ex. 2500'), { target: { value: '3000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter ce salaire' }))

    await waitFor(() =>
      expect(api.createSalaire).toHaveBeenCalledWith({
        annee: ANNEE,
        nom: 'Salaire de Julie',
        montant: 3000,
        type_montant: 'brut',
        periodicite: 'mensuel',
        statut: 'cadre',
        nombre_mois: 12,
        taux_imposition_pct: null,
        detenteur_id: null,
      }),
    )
    await waitFor(() => expect(api.getSalaires).toHaveBeenCalledTimes(2))
  })

  it("l'aperçu du formulaire montre le net après impôt seulement si un taux est saisi", async () => {
    vi.mocked(api.getSalaires).mockResolvedValue(donnees())

    render(<SalairePage />)
    await screen.findByText(/Aucun salaire enregistré pour cette année/)
    fireEvent.click(screen.getByRole('button', { name: '+ Ajouter un salaire' }))

    fireEvent.change(screen.getByPlaceholderText('ex. 2500'), { target: { value: '3000' } })
    await screen.findByText(/36\s000/)
    expect(screen.queryByText(/net après impôt\/an/)).not.toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText('ex. 11'), { target: { value: '10' } })
    await screen.findByText(/net après impôt\/an/)
  })

  it('modifie un salaire existant', async () => {
    const existant = entree({ id: 42 })
    vi.mocked(api.getSalaires)
      .mockResolvedValueOnce(donnees({ entrees: [existant], syntheses: [synthese()] }))
      .mockResolvedValueOnce(donnees({ entrees: [entree({ id: 42, montant: 3500 })], syntheses: [synthese()] }))
    vi.mocked(api.updateSalaire).mockResolvedValue(entree({ id: 42, montant: 3500 }))

    render(<SalairePage />)
    await screen.findByText('Salaire principal')

    fireEvent.click(screen.getByRole('button', { name: 'Modifier' }))
    const champMontant = screen.getByDisplayValue('3000')
    fireEvent.change(champMontant, { target: { value: '3500' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer les modifications' }))

    await waitFor(() =>
      expect(api.updateSalaire).toHaveBeenCalledWith(
        42,
        expect.objectContaining({ montant: 3500, nom: 'Salaire principal' }),
      ),
    )
  })

  it('supprime un salaire', async () => {
    vi.mocked(api.getSalaires)
      .mockResolvedValueOnce(donnees({ entrees: [entree()], syntheses: [synthese()] }))
      .mockResolvedValueOnce(donnees())
    vi.mocked(api.deleteSalaire).mockResolvedValue(undefined)

    render(<SalairePage />)
    await screen.findByText('Salaire principal')

    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }))

    await waitFor(() => expect(api.deleteSalaire).toHaveBeenCalledWith(1))
    await screen.findByText(/Aucun salaire enregistré pour cette année/)
  })

  it('agrège correctement plusieurs salaires de la même année dans la synthèse', async () => {
    const donnees2 = donnees({
      entrees: [entree({ id: 1, nom: 'Paul' }), entree({ id: 2, nom: 'Julie' })],
      syntheses: [synthese({ nombre_salaires: 2, net_total_annuel: 54000, taux_epargne_pct: 5 })],
    })
    vi.mocked(api.getSalaires).mockResolvedValue(donnees2)

    render(<SalairePage />)

    await screen.findByText('Paul')
    expect(screen.getByText('Julie')).toBeInTheDocument()
    expect(screen.getAllByText(/2 salaires/).length).toBeGreaterThan(0)
    expect(screen.getAllByText('5.0 %').length).toBeGreaterThan(0)
  })

  it("affiche l'historique du taux d'épargne sur plusieurs années et sa moyenne", async () => {
    vi.mocked(api.getSalaires).mockResolvedValue(
      donnees({
        entrees: [entree()],
        syntheses: [synthese({ annee: ANNEE, taux_epargne_pct: 10 }), synthese({ annee: ANNEE - 1, taux_epargne_pct: 20 })],
      }),
    )

    render(<SalairePage />)

    await screen.findByText('15.0 %') // moyenne (10+20)/2
    expect(screen.getByRole('cell', { name: new RegExp(String(ANNEE - 1)) })).toBeInTheDocument()
  })

  it("affiche le nom de la personne associée à côté du salaire", async () => {
    vi.mocked(api.getSalaires).mockResolvedValue(donnees({ entrees: [entree({ detenteur_nom: 'Julie' })], syntheses: [synthese()] }))

    render(<SalairePage />)

    await screen.findByText('Salaire principal')
    expect(screen.getByText('(Julie)')).toBeInTheDocument()
  })

  it('associe le salaire à une personne existante du foyer', async () => {
    vi.mocked(api.getSalaires)
      .mockResolvedValueOnce(donnees())
      .mockResolvedValueOnce(donnees({ entrees: [entree({ detenteur_id: 7, detenteur_nom: 'Julie' })], syntheses: [synthese()] }))
    vi.mocked(api.listDetenteurs).mockResolvedValue([{ id: 7, nom: 'Julie', type: 'personne', created_at: '', updated_at: '' }])
    vi.mocked(api.createSalaire).mockResolvedValue(entree({ detenteur_id: 7, detenteur_nom: 'Julie' }))

    render(<SalairePage />)
    await screen.findByText(/Aucun salaire enregistré pour cette année/)

    fireEvent.click(screen.getByRole('button', { name: '+ Ajouter un salaire' }))
    await screen.findByRole('option', { name: 'Julie' })
    fireEvent.change(screen.getByLabelText('Personne du foyer (optionnel)'), { target: { value: '7' } })
    fireEvent.change(screen.getByPlaceholderText('ex. 2500'), { target: { value: '3000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter ce salaire' }))

    await waitFor(() => expect(api.createSalaire).toHaveBeenCalledWith(expect.objectContaining({ detenteur_id: 7 })))
  })

  it('crée une nouvelle personne du foyer via la pop-up puis la sélectionne', async () => {
    vi.mocked(api.getSalaires).mockResolvedValue(donnees())
    vi.mocked(api.createDetenteur).mockResolvedValue({ id: 9, nom: 'Marc', type: 'personne', created_at: '', updated_at: '' })

    render(<SalairePage />)
    await screen.findByText(/Aucun salaire enregistré pour cette année/)
    fireEvent.click(screen.getByRole('button', { name: '+ Ajouter un salaire' }))

    fireEvent.click(screen.getByRole('button', { name: '+ Nouvelle personne' }))
    fireEvent.change(await screen.findByLabelText('Nom'), { target: { value: 'Marc' } })
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter' }))

    await waitFor(() => expect(api.createDetenteur).toHaveBeenCalledWith('Marc', 'personne'))
    expect(screen.queryByLabelText('Nom')).not.toBeInTheDocument() // pop-up refermée
    expect(screen.getByLabelText('Personne du foyer (optionnel)')).toHaveValue('9')
  })

  it("signale quand une entrée n'a pas de taux d'imposition renseigné", async () => {
    vi.mocked(api.getSalaires).mockResolvedValue(
      donnees({
        entrees: [entree()],
        syntheses: [synthese({ toutes_les_entrees_ont_un_taux_imposition: false })],
      }),
    )

    render(<SalairePage />)

    await screen.findByText((_, element) => element?.tagName === 'P' && !!element.textContent?.includes("sans taux d'imposition renseigné"))
  })
})
