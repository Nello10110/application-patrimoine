import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { api } from '../api/client'
import type { Holding, Loan } from '../api/types'
import { simulerLargeurEcran } from '../test/matchMedia'
import LoansCard from './LoansCard'

vi.mock('../api/client', () => ({
  api: {
    listLoans: vi.fn(),
    createLoan: vi.fn(),
    updateLoan: vi.fn(),
    deleteLoan: vi.fn(),
    // Rattachement à un actif (backlog 2.M.2) — non testé ici, résolution neutre.
    listHoldings: vi.fn().mockResolvedValue([]),
  },
}))

// Contrôles transverses (backlog 2.K.3) : `LoansCard` lit `usePreferencesAffichage()`
// (montants masqués) — non testé ici, stub neutre.
vi.mock('../hooks/usePreferencesAffichage', () => ({
  usePreferencesAffichage: () => ({ lentille: 'net', setLentille: vi.fn(), montantsMasques: false, toggleMontantsMasques: vi.fn() }),
}))

function loan(overrides: Partial<Loan> = {}): Loan {
  return {
    id: 1,
    libelle: 'Crédit immobilier',
    capital_initial: 200000,
    taux_annuel_pct: 3.5,
    mensualite: 1200,
    date_debut: '2020-01-01T00:00:00',
    duree_mois: 240,
    capital_restant_du_manuel: null,
    derniere_maj_manuelle: null,
    capital_restant_du: 150000,
    holding_id: null,
    created_at: '2020-01-01T00:00:00',
    updated_at: '2020-01-01T00:00:00',
    ...overrides,
  }
}

function holding(overrides: Partial<Holding> = {}): Holding {
  return {
    id: 1,
    ticker: 'MAISON',
    nom: 'Maison',
    quantite: 1,
    prix_revient_moyen: 200000,
    compte: null,
    devise: null,
    type_actif: 'REAL_ESTATE',
    origine: 'manuel',
    created_at: '2020-01-01T00:00:00',
    updated_at: '2020-01-01T00:00:00',
    market_data: null,
    rendement_depuis_achat_pct: null,
    rendement_annualise_pct: null,
    valeur: 300000,
    valeur_estimee: 300000,
    date_valeur_estimee: null,
    taux_pct: null,
    zone_geo: null,
    versement_mensuel: null,
    date_acquisition: null,
    ...overrides,
  }
}

describe('LoansCard', () => {
  it('affiche un message quand aucun emprunt n\'est enregistré, avec une invitation à en ajouter un', async () => {
    vi.mocked(api.listLoans).mockResolvedValue([])
    render(<LoansCard />)

    await screen.findByText('Aucun emprunt enregistré.')
    expect(screen.getByText(/Renseigne un crédit immobilier/)).toBeInTheDocument()
  })

  it('Réessayer relance listLoans après un échec (backlog 2.K.5)', async () => {
    vi.mocked(api.listLoans).mockRejectedValueOnce(new Error('panne simulée'))
    render(<LoansCard />)
    await screen.findByText('panne simulée')

    vi.mocked(api.listLoans).mockResolvedValueOnce([loan()])
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }))

    await screen.findByText('Crédit immobilier')
  })

  it('liste les emprunts avec leur capital restant dû', async () => {
    vi.mocked(api.listLoans).mockResolvedValue([loan()])
    render(<LoansCard />)

    await screen.findByText('Crédit immobilier')
    // "150 000 €" apparaît deux fois avec un seul emprunt (la ligne ET le total du
    // tableau, qui vaut la même somme) — on vérifie juste sa présence, pas l'unicité.
    expect(screen.getAllByText('150 000 €').length).toBeGreaterThan(0)
  })

  it("l'ajout d'un emprunt appelle createLoan puis recharge la liste", async () => {
    vi.mocked(api.listLoans).mockResolvedValueOnce([]).mockResolvedValueOnce([loan()])
    vi.mocked(api.createLoan).mockResolvedValue(loan())
    render(<LoansCard />)

    await screen.findByText('Aucun emprunt enregistré.')

    fireEvent.change(screen.getByPlaceholderText('Crédit immobilier'), { target: { value: 'Crédit immobilier' } })
    fireEvent.change(screen.getByLabelText('Capital initial'), { target: { value: '200000' } })
    fireEvent.change(screen.getByLabelText('Taux annuel (%)'), { target: { value: '3.5' } })
    fireEvent.change(screen.getByLabelText('Mensualité'), { target: { value: '1200' } })
    fireEvent.change(screen.getByLabelText('Date de début'), { target: { value: '2020-01-01' } })
    fireEvent.change(screen.getByLabelText('Durée (mois)'), { target: { value: '240' } })
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter' }))

    await screen.findByText('Crédit immobilier')
    expect(screen.getAllByText('150 000 €').length).toBeGreaterThan(0)
    expect(api.createLoan).toHaveBeenCalledWith({
      libelle: 'Crédit immobilier',
      capital_initial: 200000,
      taux_annuel_pct: 3.5,
      mensualite: 1200,
      date_debut: '2020-01-01',
      duree_mois: 240,
    })
  })

  it('le recalage manuel appelle updateLoan avec capital_restant_du_manuel', async () => {
    vi.mocked(api.listLoans).mockResolvedValue([loan()])
    vi.mocked(api.updateLoan).mockResolvedValue(loan({ capital_restant_du: 100000, capital_restant_du_manuel: 100000 }))
    render(<LoansCard />)

    await screen.findByText('Crédit immobilier')
    fireEvent.click(screen.getByRole('button', { name: 'Recaler' }))

    const input = screen.getByLabelText('Recaler le capital restant dû de Crédit immobilier')
    fireEvent.change(input, { target: { value: '100000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    await vi.waitFor(() => expect(api.updateLoan).toHaveBeenCalledWith(1, { capital_restant_du_manuel: 100000 }))
  })

  it('la suppression demande confirmation avant d\'appeler deleteLoan', async () => {
    vi.mocked(api.listLoans).mockResolvedValueOnce([loan()]).mockResolvedValueOnce([])
    vi.mocked(api.deleteLoan).mockResolvedValue({ ok: true })
    render(<LoansCard />)

    await screen.findByText('Crédit immobilier')
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }))

    const dialogue = screen.getByRole('dialog')
    expect(api.deleteLoan).not.toHaveBeenCalled()
    fireEvent.click(within(dialogue).getByRole('button', { name: 'Supprimer' }))

    await vi.waitFor(() => expect(api.deleteLoan).toHaveBeenCalledWith(1))
  })
})

describe('LoansCard — édition complète (backlog quickwin § T.1)', () => {
  it('Modifier pré-remplit le formulaire avec les valeurs actuelles', async () => {
    vi.mocked(api.listLoans).mockResolvedValue([loan()])
    render(<LoansCard />)

    await screen.findByText('Crédit immobilier')
    fireEvent.click(screen.getByRole('button', { name: 'Modifier' }))

    expect(screen.getByLabelText('Libellé de Crédit immobilier (édition)')).toHaveValue('Crédit immobilier')
    expect(screen.getByLabelText('Capital initial de Crédit immobilier (édition)')).toHaveValue(200000)
    expect(screen.getByLabelText('Taux annuel de Crédit immobilier (édition)')).toHaveValue(3.5)
    expect(screen.getByLabelText('Mensualité de Crédit immobilier (édition)')).toHaveValue(1200)
    expect(screen.getByLabelText('Date de début de Crédit immobilier (édition)')).toHaveValue('2020-01-01')
    expect(screen.getByLabelText('Durée de Crédit immobilier (édition)')).toHaveValue(240)
  })

  it("l'enregistrement appelle updateLoan avec les champs modifiés, jamais capital_restant_du_manuel", async () => {
    vi.mocked(api.listLoans).mockResolvedValueOnce([loan()]).mockResolvedValueOnce([loan({ libelle: 'Crédit renégocié', taux_annuel_pct: 2.1 })])
    vi.mocked(api.updateLoan).mockResolvedValue(loan({ libelle: 'Crédit renégocié', taux_annuel_pct: 2.1 }))
    render(<LoansCard />)

    await screen.findByText('Crédit immobilier')
    fireEvent.click(screen.getByRole('button', { name: 'Modifier' }))

    fireEvent.change(screen.getByLabelText('Libellé de Crédit immobilier (édition)'), { target: { value: 'Crédit renégocié' } })
    fireEvent.change(screen.getByLabelText('Taux annuel de Crédit immobilier (édition)'), { target: { value: '2.1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    await vi.waitFor(() =>
      expect(api.updateLoan).toHaveBeenCalledWith(1, {
        libelle: 'Crédit renégocié',
        capital_initial: 200000,
        taux_annuel_pct: 2.1,
        mensualite: 1200,
        date_debut: '2020-01-01',
        duree_mois: 240,
      }),
    )
    await screen.findByText('Crédit renégocié')
  })

  it('Annuler ferme le formulaire sans appeler updateLoan', async () => {
    vi.mocked(api.listLoans).mockResolvedValue([loan()])
    render(<LoansCard />)

    await screen.findByText('Crédit immobilier')
    fireEvent.click(screen.getByRole('button', { name: 'Modifier' }))
    vi.mocked(api.updateLoan).mockClear()
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }))

    expect(api.updateLoan).not.toHaveBeenCalled()
    expect(screen.queryByLabelText('Libellé de Crédit immobilier (édition)')).not.toBeInTheDocument()
  })

  it('un libellé vidé bloque la sauvegarde côté client', async () => {
    vi.mocked(api.listLoans).mockResolvedValue([loan()])
    render(<LoansCard />)

    await screen.findByText('Crédit immobilier')
    fireEvent.click(screen.getByRole('button', { name: 'Modifier' }))
    fireEvent.change(screen.getByLabelText('Libellé de Crédit immobilier (édition)'), { target: { value: '  ' } })
    vi.mocked(api.updateLoan).mockClear()
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    expect(api.updateLoan).not.toHaveBeenCalled()
  })

  it("l'édition fonctionne aussi dans la vue carte (mobile)", async () => {
    simulerLargeurEcran(true)
    vi.mocked(api.listLoans).mockResolvedValueOnce([loan()]).mockResolvedValueOnce([loan({ mensualite: 1500 })])
    vi.mocked(api.updateLoan).mockResolvedValue(loan({ mensualite: 1500 }))
    render(<LoansCard />)

    await screen.findByText('Crédit immobilier')
    fireEvent.click(screen.getByRole('button', { name: 'Modifier' }))
    fireEvent.change(screen.getByLabelText('Mensualité de Crédit immobilier (édition)'), { target: { value: '1500' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    await vi.waitFor(() =>
      expect(api.updateLoan).toHaveBeenCalledWith(1, {
        libelle: 'Crédit immobilier',
        capital_initial: 200000,
        taux_annuel_pct: 3.5,
        mensualite: 1500,
        date_debut: '2020-01-01',
        duree_mois: 240,
      }),
    )
  })
})

describe('LoansCard — rattachement à un actif (backlog 2.M.2)', () => {
  it('propose "Aucun" + chaque actif du portefeuille dans le sélecteur de rattachement', async () => {
    vi.mocked(api.listLoans).mockResolvedValue([loan()])
    vi.mocked(api.listHoldings).mockResolvedValue([holding({ id: 1, nom: 'Maison' }), holding({ id: 2, ticker: 'AAPL', nom: 'Apple' })])
    render(<LoansCard />)
    await screen.findByText('Crédit immobilier')

    const select = await screen.findByDisplayValue('Aucun')
    expect(within(select).getByRole('option', { name: 'Maison' })).toBeInTheDocument()
    expect(within(select).getByRole('option', { name: 'Apple' })).toBeInTheDocument()
  })

  it('choisir un actif appelle updateLoan avec holding_id puis recharge la liste', async () => {
    vi.mocked(api.listLoans).mockResolvedValueOnce([loan()]).mockResolvedValueOnce([loan({ holding_id: 1 })])
    vi.mocked(api.listHoldings).mockResolvedValue([holding({ id: 1, nom: 'Maison' })])
    vi.mocked(api.updateLoan).mockResolvedValue(loan({ holding_id: 1 }))
    render(<LoansCard />)
    await screen.findByText('Crédit immobilier')
    const select = await screen.findByDisplayValue('Aucun')

    fireEvent.change(select, { target: { value: '1' } })

    await vi.waitFor(() => expect(api.updateLoan).toHaveBeenCalledWith(1, { holding_id: 1 }))
  })

  it('un emprunt déjà rattaché affiche le bon actif présélectionné', async () => {
    vi.mocked(api.listLoans).mockResolvedValue([loan({ holding_id: 2 })])
    vi.mocked(api.listHoldings).mockResolvedValue([holding({ id: 1, nom: 'Maison' }), holding({ id: 2, ticker: 'AAPL', nom: 'Apple' })])
    render(<LoansCard />)

    await screen.findByDisplayValue('Apple')
  })
})

describe('LoansCard — cartes sur mobile (backlog 2.K.4)', () => {
  it('affiche une carte par emprunt (pas de tableau) avec ses informations clés', async () => {
    simulerLargeurEcran(true)
    vi.mocked(api.listLoans).mockResolvedValue([loan()])
    render(<LoansCard />)

    await screen.findByText('Crédit immobilier')
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.getByText('3.50%')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Recaler' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Supprimer' })).toBeInTheDocument()
  })

  it('le recalage manuel fonctionne aussi dans la vue carte', async () => {
    simulerLargeurEcran(true)
    vi.mocked(api.listLoans).mockResolvedValue([loan()])
    vi.mocked(api.updateLoan).mockResolvedValue(loan({ capital_restant_du: 100000, capital_restant_du_manuel: 100000 }))
    render(<LoansCard />)
    await screen.findByText('Crédit immobilier')

    fireEvent.click(screen.getByRole('button', { name: 'Recaler' }))
    const input = screen.getByLabelText('Recaler le capital restant dû de Crédit immobilier')
    fireEvent.change(input, { target: { value: '100000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    await vi.waitFor(() => expect(api.updateLoan).toHaveBeenCalledWith(1, { capital_restant_du_manuel: 100000 }))
  })

  it('le rattachement à un actif fonctionne aussi dans la vue carte', async () => {
    simulerLargeurEcran(true)
    vi.mocked(api.listLoans).mockResolvedValueOnce([loan()]).mockResolvedValueOnce([loan({ holding_id: 1 })])
    vi.mocked(api.listHoldings).mockResolvedValue([holding({ id: 1, nom: 'Maison' })])
    vi.mocked(api.updateLoan).mockResolvedValue(loan({ holding_id: 1 }))
    render(<LoansCard />)
    await screen.findByText('Crédit immobilier')

    fireEvent.change(screen.getByDisplayValue('Aucun'), { target: { value: '1' } })

    await vi.waitFor(() => expect(api.updateLoan).toHaveBeenCalledWith(1, { holding_id: 1 }))
  })
})
