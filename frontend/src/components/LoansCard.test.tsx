import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { api } from '../api/client'
import type { Loan } from '../api/types'
import LoansCard from './LoansCard'

vi.mock('../api/client', () => ({
  api: {
    listLoans: vi.fn(),
    createLoan: vi.fn(),
    updateLoan: vi.fn(),
    deleteLoan: vi.fn(),
  },
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
    created_at: '2020-01-01T00:00:00',
    updated_at: '2020-01-01T00:00:00',
    ...overrides,
  }
}

describe('LoansCard', () => {
  it('affiche un message quand aucun emprunt n\'est enregistré', async () => {
    vi.mocked(api.listLoans).mockResolvedValue([])
    render(<LoansCard />)

    await screen.findByText('Aucun emprunt enregistré.')
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
