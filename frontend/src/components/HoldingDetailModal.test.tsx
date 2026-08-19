import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../api/client'
import type { HoldingDetail } from '../api/types'
import HoldingDetailModal from './HoldingDetailModal'

vi.mock('../api/client', () => ({
  api: {
    getHoldingDetail: vi.fn(),
    getHoldingPriceHistory: vi.fn(),
  },
}))

vi.mock('./HoldingPriceHistoryChart', () => ({ default: () => <div /> }))

function detail(overrides: Partial<HoldingDetail> = {}): HoldingDetail {
  return {
    ticker: 'AAPL',
    nom: 'Apple Inc.',
    type_actif: 'STOCK',
    quantite: 10,
    prix_revient_moyen: 100,
    prix_actuel: 150,
    valeur: 1500,
    devise: 'USD',
    secteur: 'Technologie',
    pays: 'États-Unis',
    rendement_depuis_achat_pct: 50,
    rendement_annualise_pct: 10,
    emetteur: null,
    resume: null,
    frais_gestion_pct: null,
    frais_transaction_payes: 0,
    repartition_geo: [],
    repartition_sector: [],
    composition_actions: [],
    ...overrides,
  }
}

// LOT 6.1 : seul lien de l'application vers `/portefeuille/:ticker` — verrouille sa
// présence, sa cible, et qu'il referme la modale (pour ne pas la laisser ouverte
// par-dessus la page de destination).
describe('HoldingDetailModal — lien "Ouvrir en pleine page" (LOT 6.1)', () => {
  beforeEach(() => {
    vi.mocked(api.getHoldingDetail).mockResolvedValue(detail())
  })

  it('affiche un lien vers la fiche en pleine page et ferme la modale au clic', async () => {
    const onClose = vi.fn()
    render(
      <MemoryRouter initialEntries={['/portefeuille']}>
        <Routes>
          <Route path="/portefeuille" element={<HoldingDetailModal ticker="AAPL" onClose={onClose} />} />
          <Route path="/portefeuille/:ticker" element={<p>Page pleine écran : AAPL</p>} />
        </Routes>
      </MemoryRouter>,
    )

    const lien = await screen.findByRole('link', { name: /Ouvrir en pleine page/ })
    expect(lien).toHaveAttribute('href', '/portefeuille/AAPL')

    fireEvent.click(lien)

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(await screen.findByText('Page pleine écran : AAPL')).toBeInTheDocument()
  })
})
