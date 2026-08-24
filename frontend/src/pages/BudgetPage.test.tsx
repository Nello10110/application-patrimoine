import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { api } from '../api/client'
import type { BudgetSummary, CategorieBudget, JonctionPatrimoine, MouvementBancaire, RecurrenceDetectee, RegleCategorisation } from '../api/types'
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
    getBudgetRecurrences: vi.fn(),
    getJonctionPatrimoine: vi.fn(),
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

function recurrence(overrides: Partial<RecurrenceDetectee> = {}): RecurrenceDetectee {
  return {
    libelle: 'Netflix',
    categorie_id: null,
    montant_actuel: 12.99,
    montant_precedent: 12.99,
    hausse_prix: false,
    occurrences: 3,
    premiere_date: '2025-12-05',
    derniere_date: '2026-02-05',
    periodicite: 'mensuelle',
    ...overrides,
  }
}

function jonction(overrides: Partial<JonctionPatrimoine> = {}): JonctionPatrimoine {
  return {
    taux_epargne_reel_pct: 20,
    reste_a_vivre: 1500,
    versement_mensuel_suggere: 400,
    categorie_epargne_introuvable: false,
    categorie_logement_introuvable: false,
    ...overrides,
  }
}

function mockChargement(overrides: {
  summary?: BudgetSummary
  mouvements?: MouvementBancaire[]
  categories?: CategorieBudget[]
  regles?: RegleCategorisation[]
  recurrences?: RecurrenceDetectee[]
  jonction?: JonctionPatrimoine
} = {}) {
  vi.mocked(api.getBudgetSummary).mockResolvedValue(overrides.summary ?? summary())
  vi.mocked(api.listMouvementsBancaires).mockResolvedValue(overrides.mouvements ?? [mouvement()])
  vi.mocked(api.listCategoriesBudget).mockResolvedValue(overrides.categories ?? [categorie()])
  vi.mocked(api.listReglesCategorisation).mockResolvedValue(overrides.regles ?? [regle()])
  vi.mocked(api.getBudgetRecurrences).mockResolvedValue(overrides.recurrences ?? [])
  vi.mocked(api.getJonctionPatrimoine).mockResolvedValue(
    overrides.jonction ?? jonction({ taux_epargne_reel_pct: null, reste_a_vivre: null }),
  )
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

describe('BudgetPage — récurrences et abonnements (backlog 2.N.3)', () => {
  it("n'affiche pas la section s'il n'y a aucune récurrence détectée", async () => {
    mockChargement({ recurrences: [] })
    render(<BudgetPage />)

    await screen.findByPlaceholderText('Nouvelle catégorie')
    expect(screen.queryByText('Charges récurrentes et abonnements')).not.toBeInTheDocument()
  })

  it('liste les récurrences détectées avec leur périodicité et leurs occurrences', async () => {
    mockChargement({ recurrences: [recurrence()] })
    render(<BudgetPage />)

    await screen.findByText('Charges récurrentes et abonnements')
    expect(screen.getByText('Netflix')).toBeInTheDocument()
    expect(screen.getByText('Mensuelle')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('12,99 €')).toBeInTheDocument()
    expect(screen.queryByText('Hausse de prix')).not.toBeInTheDocument()
  })

  it('affiche un badge « Hausse de prix » quand détectée', async () => {
    mockChargement({ recurrences: [recurrence({ hausse_prix: true, montant_actuel: 14.99, montant_precedent: 12.99 })] })
    render(<BudgetPage />)

    await screen.findByText('Hausse de prix')
  })

  it("s'affiche même si la période sélectionnée n'a aucun mouvement (fenêtre indépendante)", async () => {
    mockChargement({ mouvements: [], recurrences: [recurrence()] })
    render(<BudgetPage />)

    await screen.findByText('Aucun mouvement bancaire importé pour cette période.')
    expect(screen.getByText('Charges récurrentes et abonnements')).toBeInTheDocument()
  })
})

describe('BudgetPage — jonction budget/patrimoine (backlog 2.N.4)', () => {
  it("n'affiche pas le taux d'épargne ni le reste à vivre si les catégories n'existent pas", async () => {
    mockChargement()
    render(<BudgetPage />)

    await screen.findByPlaceholderText('Nouvelle catégorie')
    expect(screen.queryByText("Taux d'épargne réel")).not.toBeInTheDocument()
    expect(screen.queryByText('Reste à vivre')).not.toBeInTheDocument()
  })

  it("affiche le taux d'épargne réel et le reste à vivre quand disponibles", async () => {
    mockChargement({ jonction: jonction({ taux_epargne_reel_pct: 25.5, reste_a_vivre: 1200 }) })
    render(<BudgetPage />)

    await screen.findByText("Taux d'épargne réel")
    expect(screen.getByText('25.5 %')).toBeInTheDocument()
    expect(screen.getByText('Reste à vivre')).toBeInTheDocument()
    expect(screen.getByText('1 200 €')).toBeInTheDocument()
  })

  it('affiche un message explicatif quand la catégorie Épargne ou Logement est introuvable', async () => {
    mockChargement({
      jonction: jonction({ taux_epargne_reel_pct: null, categorie_epargne_introuvable: true, reste_a_vivre: null, categorie_logement_introuvable: true }),
    })
    render(<BudgetPage />)

    await screen.findByText(/Taux d'épargne indisponible/)
    expect(screen.getByText(/Reste à vivre indisponible/)).toBeInTheDocument()
  })
})
