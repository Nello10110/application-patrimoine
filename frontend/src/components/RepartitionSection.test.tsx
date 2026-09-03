import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../api/client'
import RepartitionSection from './RepartitionSection'
import type { BudgetSummary } from '../api/types'

vi.mock('../api/client', () => ({ api: { setBudgetCible: vi.fn(), deleteBudgetCible: vi.fn() } }))
vi.mock('../hooks/usePreferencesAffichage', () => ({ usePreferencesAffichage: () => ({ montantsMasques: false }) }))

const SUMMARY = {
  total_entrees: 3000,
  total_sorties: 2000,
  solde: 1000,
  repartition_sorties: [{ categorie_id: 1, categorie: 'Logement', montant: 900, cible_mensuelle: 800 }],
} as unknown as BudgetSummary

describe('RepartitionSection — cible budgétaire', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.setBudgetCible).mockResolvedValue(undefined as never)
    vi.mocked(api.deleteBudgetCible).mockResolvedValue(undefined as never)
  })

  it('vider le champ retire la cible', async () => {
    // Revue du 03/09/2026 : `enregistrer` sortait sans rien faire quand le champ
    // était vide. Une cible posée par erreur ne pouvait donc plus être retirée par
    // l'interface, alors que l'endpoint existait déjà côté serveur.
    const onCibleChanged = vi.fn()
    render(<RepartitionSection summary={SUMMARY} onCibleChanged={onCibleChanged} />)

    const champ = screen.getByDisplayValue('800')
    fireEvent.change(champ, { target: { value: '' } })
    fireEvent.blur(champ)

    await waitFor(() => expect(api.deleteBudgetCible).toHaveBeenCalledWith(1))
    expect(api.setBudgetCible).not.toHaveBeenCalled()
    expect(onCibleChanged).toHaveBeenCalled()
  })

  it('saisir un montant enregistre la cible', async () => {
    render(<RepartitionSection summary={SUMMARY} onCibleChanged={vi.fn()} />)

    const champ = screen.getByDisplayValue('800')
    fireEvent.change(champ, { target: { value: '750' } })
    fireEvent.blur(champ)

    await waitFor(() => expect(api.setBudgetCible).toHaveBeenCalledWith(1, 750))
    expect(api.deleteBudgetCible).not.toHaveBeenCalled()
  })

  it('un montant négatif est ignoré', async () => {
    render(<RepartitionSection summary={SUMMARY} onCibleChanged={vi.fn()} />)

    const champ = screen.getByDisplayValue('800')
    fireEvent.change(champ, { target: { value: '-10' } })
    fireEvent.blur(champ)

    await waitFor(() => expect(api.setBudgetCible).not.toHaveBeenCalled())
    expect(api.deleteBudgetCible).not.toHaveBeenCalled()
  })
})
