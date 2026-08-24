import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { api } from '../api/client'
import type { BudgetSummary, CategorieBudget, MouvementBancaire, RegleCategorisation } from '../api/types'
import BudgetPage from './BudgetPage'

vi.mock('../api/client', () => ({
  api: {
    getBudgetSummary: vi.fn(),
    listMouvementsBancaires: vi.fn(),
    listCategoriesBudget: vi.fn(),
    listReglesCategorisation: vi.fn(),
    setBudgetCible: vi.fn(),
    categoriserMouvement: vi.fn(),
    createCategorieBudget: vi.fn(),
    deleteCategorieBudget: vi.fn(),
    createRegleCategorisation: vi.fn(),
    deleteRegleCategorisation: vi.fn(),
    reappliquerReglesCategorisation: vi.fn(),
  },
}))

vi.mock('../hooks/usePreferencesAffichage', () => ({
  usePreferencesAffichage: () => ({ montantsMasques: false }),
}))

function summary(overrides: Partial<BudgetSummary> = {}): BudgetSummary {
  return {
    entrees: 2000,
    sorties: 950,
    disponible: 1050,
    depenses_recurrentes_mensuelles: 15,
    repartition_sorties: [{ categorie_id: 1, categorie_nom: 'Transport', montant: 50, cible_mensuelle: 100 }],
    ...overrides,
  }
}

function mouvement(overrides: Partial<MouvementBancaire> = {}): MouvementBancaire {
  return {
    id: 1,
    date: '2026-02-01',
    libelle: 'SNCF Connect',
    montant: -50,
    compte: null,
    categorie_id: 1,
    categorise_manuellement: false,
    ...overrides,
  }
}

function categorie(overrides: Partial<CategorieBudget> = {}): CategorieBudget {
  return { id: 1, nom: 'Transport', parent_id: null, ...overrides }
}

function regle(overrides: Partial<RegleCategorisation> = {}): RegleCategorisation {
  return { id: 1, motif: 'sncf', categorie_id: 1, ...overrides }
}

function mockChargement(overrides: { summary?: BudgetSummary; mouvements?: MouvementBancaire[]; categories?: CategorieBudget[]; regles?: RegleCategorisation[] } = {}) {
  vi.mocked(api.getBudgetSummary).mockResolvedValue(overrides.summary ?? summary())
  vi.mocked(api.listMouvementsBancaires).mockResolvedValue(overrides.mouvements ?? [mouvement()])
  vi.mocked(api.listCategoriesBudget).mockResolvedValue(overrides.categories ?? [categorie()])
  vi.mocked(api.listReglesCategorisation).mockResolvedValue(overrides.regles ?? [regle()])
}

describe('BudgetPage — indicateurs et répartition (backlog 2.N.2)', () => {
  it('affiche les quatre indicateurs de la période', async () => {
    mockChargement()
    render(<BudgetPage />)

    expect(await screen.findByText('2 000 €')).toBeInTheDocument()
    expect(screen.getByText('950 €')).toBeInTheDocument()
    expect(screen.getByText('1 050 €')).toBeInTheDocument()
    expect(screen.getByText('15 €')).toBeInTheDocument()
  })

  it('affiche un état vide si aucun mouvement sur la période', async () => {
    mockChargement({ mouvements: [] })
    render(<BudgetPage />)

    expect(await screen.findByText('Aucun mouvement bancaire importé pour cette période.')).toBeInTheDocument()
    expect(screen.queryByText('Entrées')).not.toBeInTheDocument()
  })

  it('affiche la répartition des sorties avec la cible et l\'écart', async () => {
    mockChargement()
    render(<BudgetPage />)

    const [tableRepartition] = await screen.findAllByRole('table')
    const ligne = within(tableRepartition).getByText('Transport').closest('tr')!
    expect(within(ligne).getByText('50,00 €', { selector: '.text-texte' })).toBeInTheDocument()
    expect(within(ligne).getByDisplayValue('100')).toBeInTheDocument()
    expect(within(ligne).getByText('50,00 €', { selector: '.text-positif' })).toBeInTheDocument()
  })

  it('modifier la cible appelle setBudgetCible et recharge', async () => {
    mockChargement()
    vi.mocked(api.setBudgetCible).mockResolvedValue({ categorie_id: 1, montant_mensuel: 200 })
    render(<BudgetPage />)

    await screen.findByDisplayValue('100')
    const champ = screen.getByDisplayValue('100')
    fireEvent.change(champ, { target: { value: '200' } })
    fireEvent.blur(champ)

    await waitFor(() => expect(api.setBudgetCible).toHaveBeenCalledWith(1, 200))
  })
})

describe('BudgetPage — mouvements (backlog 2.N.1)', () => {
  it('recatégoriser un mouvement appelle categoriserMouvement', async () => {
    mockChargement({ categories: [categorie({ id: 1, nom: 'Transport' }), categorie({ id: 2, nom: 'Loisirs' })] })
    vi.mocked(api.categoriserMouvement).mockResolvedValue(mouvement({ categorie_id: 2 }))
    render(<BudgetPage />)

    await screen.findByText('SNCF Connect')
    const select = screen.getByDisplayValue('Transport')
    fireEvent.change(select, { target: { value: '2' } })

    await waitFor(() => expect(api.categoriserMouvement).toHaveBeenCalledWith(1, 2))
  })

  it('le filtre par catégorie masque les mouvements des autres catégories', async () => {
    mockChargement({
      categories: [categorie({ id: 1, nom: 'Transport' }), categorie({ id: 2, nom: 'Loisirs' })],
      mouvements: [mouvement({ id: 1, libelle: 'SNCF Connect', categorie_id: 1 }), mouvement({ id: 2, libelle: 'Ciné', categorie_id: 2 })],
    })
    render(<BudgetPage />)

    await screen.findByText('SNCF Connect')
    expect(screen.getByText('Ciné')).toBeInTheDocument()

    fireEvent.change(screen.getByDisplayValue('Toutes catégories'), { target: { value: '1' } })

    expect(screen.getByText('SNCF Connect')).toBeInTheDocument()
    expect(screen.queryByText('Ciné')).not.toBeInTheDocument()
  })

  it('le filtre par compte masque les mouvements des autres comptes', async () => {
    mockChargement({
      mouvements: [
        mouvement({ id: 1, libelle: 'Courant A', compte: 'Compte A' }),
        mouvement({ id: 2, libelle: 'Courant B', compte: 'Compte B' }),
      ],
    })
    render(<BudgetPage />)

    await screen.findByText('Courant A')
    fireEvent.change(screen.getByDisplayValue('Tous les comptes'), { target: { value: 'Compte A' } })

    expect(screen.getByText('Courant A')).toBeInTheDocument()
    expect(screen.queryByText('Courant B')).not.toBeInTheDocument()
  })
})

describe('BudgetPage — catégories et règles (backlog 2.N.1)', () => {
  it('ajouter une catégorie appelle createCategorieBudget puis recharge', async () => {
    mockChargement()
    vi.mocked(api.createCategorieBudget).mockResolvedValue(categorie({ id: 2, nom: 'Santé' }))
    render(<BudgetPage />)

    await screen.findByPlaceholderText('Nouvelle catégorie')
    fireEvent.change(screen.getByPlaceholderText('Nouvelle catégorie'), { target: { value: 'Santé' } })
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter' }))

    await waitFor(() => expect(api.createCategorieBudget).toHaveBeenCalledWith('Santé'))
  })

  it('ajouter une règle appelle createRegleCategorisation avec le motif et la catégorie choisis', async () => {
    mockChargement()
    vi.mocked(api.createRegleCategorisation).mockResolvedValue(regle({ id: 2, motif: 'uber', categorie_id: 1 }))
    render(<BudgetPage />)

    await screen.findByPlaceholderText('Nouvelle catégorie')
    fireEvent.change(screen.getByPlaceholderText('Motif (ex. sncf)'), { target: { value: 'uber' } })
    fireEvent.change(screen.getByDisplayValue('— Catégorie —'), { target: { value: '1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter la règle' }))

    await waitFor(() => expect(api.createRegleCategorisation).toHaveBeenCalledWith('uber', 1))
  })

  it('réappliquer les règles appelle reappliquerReglesCategorisation et affiche le résultat', async () => {
    mockChargement()
    vi.mocked(api.reappliquerReglesCategorisation).mockResolvedValue({ mouvements_modifies: 3 })
    render(<BudgetPage />)

    await screen.findByPlaceholderText('Nouvelle catégorie')
    fireEvent.click(screen.getByRole('button', { name: 'Réappliquer les règles en masse' }))

    await screen.findByText('3 mouvement(s) recatégorisé(s).')
  })

  it('supprimer une catégorie appelle deleteCategorieBudget', async () => {
    mockChargement()
    vi.mocked(api.deleteCategorieBudget).mockResolvedValue(undefined)
    render(<BudgetPage />)

    await screen.findByPlaceholderText('Nouvelle catégorie')
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer Transport' }))

    await waitFor(() => expect(api.deleteCategorieBudget).toHaveBeenCalledWith(1))
  })
})
