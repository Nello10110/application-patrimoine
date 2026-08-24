import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../api/client'
import type { HoldingDetail } from '../api/types'
import HoldingDetailModal from './HoldingDetailModal'

vi.mock('../api/client', () => ({
  api: {
    getHoldingDetail: vi.fn(),
    getHoldingPriceHistory: vi.fn(),
    // Détenteurs (backlog 2.L.1) : `HoldingDetailContent` lit `listDetenteurs()` —
    // non testé ici, résolution neutre.
    listDetenteurs: vi.fn().mockResolvedValue([]),
  },
}))

vi.mock('./HoldingPriceHistoryChart', () => ({ default: () => <div /> }))

// Contrôles transverses (backlog 2.K.3) : `HoldingDetailContent` (rendue par cette
// modale) lit `usePreferencesAffichage()` (montants masqués) — non testé ici, stub
// neutre.
vi.mock('../hooks/usePreferencesAffichage', () => ({
  usePreferencesAffichage: () => ({ lentille: 'net', setLentille: vi.fn(), montantsMasques: false, toggleMontantsMasques: vi.fn() }),
}))

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
    repartition_geo_detaillee: [],
    repartition_sector_detaillee: [],
    composition_actions: [],
    quotites: [],
    immobilier: null,
    ...overrides,
  }
}

// LOT 6.1 : seul lien de l'application vers `/patrimoine/:ticker` — verrouille sa
// présence, sa cible, et qu'il referme la modale (pour ne pas la laisser ouverte
// par-dessus la page de destination).
describe('HoldingDetailModal — lien "Ouvrir en pleine page" (LOT 6.1)', () => {
  beforeEach(() => {
    vi.mocked(api.getHoldingDetail).mockResolvedValue(detail())
  })

  it('affiche un lien vers la fiche en pleine page et ferme la modale au clic', async () => {
    const onClose = vi.fn()
    render(
      <MemoryRouter initialEntries={['/patrimoine']}>
        <Routes>
          <Route path="/patrimoine" element={<HoldingDetailModal ticker="AAPL" onClose={onClose} />} />
          <Route path="/patrimoine/:ticker" element={<p>Page pleine écran : AAPL</p>} />
        </Routes>
      </MemoryRouter>,
    )

    const lien = await screen.findByRole('link', { name: /Ouvrir en pleine page/ })
    expect(lien).toHaveAttribute('href', '/patrimoine/AAPL')

    fireEvent.click(lien)

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(await screen.findByText('Page pleine écran : AAPL')).toBeInTheDocument()
  })
})

describe('HoldingDetailModal — erreur avec action de reprise (backlog 2.K.5)', () => {
  it('Réessayer relance getHoldingDetail après un échec', async () => {
    vi.mocked(api.getHoldingDetail).mockClear()
    vi.mocked(api.getHoldingDetail).mockRejectedValueOnce(new Error('panne simulée'))
    render(
      <MemoryRouter>
        <HoldingDetailModal ticker="AAPL" onClose={vi.fn()} />
      </MemoryRouter>,
    )

    await screen.findByText('panne simulée')

    vi.mocked(api.getHoldingDetail).mockResolvedValueOnce(detail())
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }))

    // "Apple Inc." apparaît deux fois une fois la fiche chargée (titre de la modale
    // ET titre du contenu) — `findAllByText` plutôt que `findByText` pour ne pas
    // lever sur cette ambiguïté déjà présente hors de ce test.
    expect(await screen.findAllByText('Apple Inc.')).not.toHaveLength(0)
    expect(api.getHoldingDetail).toHaveBeenCalledTimes(2)
  })
})

// LOT 6.12 : composition_actions justETF (2.6) n'a pas de ticker Yahoo distinct — le
// service pose `symbol === nom` (le nom de l'entreprise dans les deux champs), ce qui
// ne doit pas afficher un sous-titre redondant comme le fait déjà la composition
// yfinance existante (`symbol` = ticker, ex. "AAPL", différent de `nom`).
describe('HoldingDetailModal — sous-titre de la composition en actions (LOT 6.12)', () => {
  function render_avec(composition_actions: NonNullable<HoldingDetail['composition_actions']>) {
    vi.mocked(api.getHoldingDetail).mockResolvedValue(detail({ composition_actions }))
    return render(
      <MemoryRouter>
        <HoldingDetailModal ticker="IWDA" onClose={vi.fn()} />
      </MemoryRouter>,
    )
  }

  it("masque le sous-titre quand symbol et nom sont identiques (justETF, pas de ticker distinct)", async () => {
    render_avec([{ symbol: 'HDFC Bank Ltd.', nom: 'HDFC Bank Ltd.', poids: 0.0679, pays: null, secteur: null }])

    await screen.findByText('Composition en actions (10 plus grosses lignes du fonds)')
    // Scopé à la ligne du tableau (le graphique recharts affiche aussi le nom en
    // étiquette d'axe, donc `screen.getAllByText` compterait aussi cette occurrence).
    const ligne = within(screen.getByRole('table')).getByText('HDFC Bank Ltd.').closest('tr')!
    expect(within(ligne).getAllByText('HDFC Bank Ltd.')).toHaveLength(1)
  })

  it('garde le sous-titre quand symbol et nom diffèrent (yfinance, ticker distinct du nom)', async () => {
    render_avec([{ symbol: 'AAPL', nom: 'Apple Inc.', poids: 0.05, pays: 'États-Unis', secteur: 'Technologie' }])

    await screen.findByText('Composition en actions (10 plus grosses lignes du fonds)')
    const ligne = within(screen.getByRole('table')).getByText('Apple Inc.').closest('tr')!
    expect(within(ligne).getByText('AAPL')).toBeInTheDocument()
  })
})
