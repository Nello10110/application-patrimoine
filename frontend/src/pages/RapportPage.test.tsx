import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../api/client'
import type { RapportMensuel } from '../api/types'
import RapportPage from './RapportPage'

vi.mock('../api/client', () => ({
  api: {
    getRapportMensuel: vi.fn(),
  },
}))

function rapport(overrides: Partial<RapportMensuel> = {}): RapportMensuel {
  return {
    annee: 2026,
    mois: 7,
    valeur_debut_mois: 1000,
    valeur_fin_mois: 1100,
    evolution_pct: 10,
    dividendes_percus: 8.5,
    nombre_transactions: 3,
    plus_gros_mouvements: [{ date: '2026-07-15', type: 'BUY', symbol: 'AAA', nom: 'Titre AAA', montant: -500 }],
    ...overrides,
  }
}

describe('RapportPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.getRapportMensuel).mockResolvedValue(rapport())
  })

  it('charge le rapport du mois courant au montage et affiche ses indicateurs', async () => {
    render(<RapportPage />)

    await waitFor(() => expect(api.getRapportMensuel).toHaveBeenCalled())
    expect(screen.getByText('+10.0%')).toBeInTheDocument()
    expect(screen.getByText('8,50 €')).toBeInTheDocument()
    expect(screen.getByText(/Titre AAA/)).toBeInTheDocument()
  })

  it('recharge le rapport quand le mois sélectionné change', async () => {
    render(<RapportPage />)
    await waitFor(() => expect(api.getRapportMensuel).toHaveBeenCalledTimes(1))

    const input = screen.getByDisplayValue(/\d{4}-\d{2}/)
    fireEvent.change(input, { target: { value: '2026-03' } })

    await waitFor(() => expect(api.getRapportMensuel).toHaveBeenCalledWith(2026, 3))
  })

  it("affiche un message dédié quand aucune donnée n'existe pour le mois", async () => {
    vi.mocked(api.getRapportMensuel).mockResolvedValue(
      rapport({ valeur_debut_mois: null, valeur_fin_mois: null, evolution_pct: null, nombre_transactions: 0, plus_gros_mouvements: [] }),
    )

    render(<RapportPage />)

    await screen.findByText(/Aucune donnée disponible pour ce mois/)
  })
})
