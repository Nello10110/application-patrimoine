import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../api/client'
import type { Holding } from '../api/types'
import PortefeuillePage from './PortefeuillePage'

vi.mock('../api/client', () => ({
  api: {
    listHoldings: vi.fn(),
    createHolding: vi.fn(),
    updateHolding: vi.fn(),
    deleteHolding: vi.fn(),
    refreshMarketData: vi.fn(),
    getRefreshStatus: vi.fn(),
  },
}))

// La fiche détaillée (modale) n'est pas l'objet de ce fichier : mise de côté pour ne
// vérifier que sa présence/absence (ouverture au clic sur une ligne, cf. LOT 5.8).
vi.mock('../components/HoldingDetailModal', () => ({
  default: ({ ticker }: { ticker: string }) => <div data-testid="modale-detail">{ticker}</div>,
}))

function holding(overrides: Partial<Holding> = {}): Holding {
  return {
    id: 1,
    ticker: 'AAA',
    nom: 'Titre A',
    quantite: 10,
    prix_revient_moyen: 100,
    compte: null,
    devise: 'EUR',
    type_actif: 'STOCK',
    origine: 'manuel',
    created_at: '2024-01-01T00:00:00',
    updated_at: '2024-01-01T00:00:00',
    market_data: null,
    rendement_depuis_achat_pct: null,
    rendement_annualise_pct: null,
    ...overrides,
  }
}

function marketData(overrides: Partial<NonNullable<Holding['market_data']>> = {}) {
  return {
    ticker: 'AAA',
    nom: null,
    prix_actuel: 100,
    devise: 'EUR',
    secteur: null,
    pays: null,
    region: null,
    erreur: null,
    derniere_maj: '2026-08-18T14:32:00',
    ...overrides,
  }
}

describe('PortefeuillePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.getRefreshStatus).mockResolvedValue({
      en_cours: false,
      positions_traitees: 0,
      positions_total: 0,
      demarre_le: null,
      termine_le: null,
      statut: null,
      message: null,
    })
  })

  describe('tri des colonnes', () => {
    // `origine: 'reconstruit'` : évite le badge "saisie manuelle" (origine par
    // défaut de la fixture `holding()`) dans la cellule Ticker, qui polluerait le
    // texte comparé par `tickersAffiches`.
    const lignes = [
      holding({ id: 1, ticker: 'BBB', quantite: 5, origine: 'reconstruit', market_data: marketData({ ticker: 'BBB', prix_actuel: 50 }) }),
      holding({ id: 2, ticker: 'AAA', quantite: 20, origine: 'reconstruit', market_data: marketData({ ticker: 'AAA', prix_actuel: 200 }) }),
      // Sans cotation ni prix de revient : valeur nulle, doit toujours finir en dernier.
      holding({ id: 3, ticker: 'CCC', quantite: 1, origine: 'reconstruit', prix_revient_moyen: null, market_data: null }),
    ]

    beforeEach(() => {
      vi.mocked(api.listHoldings).mockResolvedValue(lignes)
    })

    function tickersAffiches() {
      return screen
        .getAllByRole('row')
        .slice(1, -1) // ignore la ligne d'en-tête et la ligne de total (tfoot)
        .map((row) => within(row).queryAllByRole('cell')[0]?.textContent?.trim())
        .filter((t): t is string => Boolean(t))
    }

    it('trie par ticker croissant au premier clic, décroissant au second', async () => {
      render(<PortefeuillePage />)
      const enTeteTicker = await screen.findByRole('columnheader', { name: /Ticker/ })

      fireEvent.click(enTeteTicker)
      await waitFor(() => expect(enTeteTicker).toHaveAttribute('aria-sort', 'ascending'))
      expect(tickersAffiches()).toEqual(['AAA', 'BBB', 'CCC'])

      fireEvent.click(enTeteTicker)
      await waitFor(() => expect(enTeteTicker).toHaveAttribute('aria-sort', 'descending'))
      expect(tickersAffiches()).toEqual(['CCC', 'BBB', 'AAA'])
    })

    it('trie par valeur, en repoussant les valeurs nulles (—) en fin de liste quel que soit le sens', async () => {
      render(<PortefeuillePage />)
      const enTeteValeur = await screen.findByRole('columnheader', { name: /^Valeur/ })

      fireEvent.click(enTeteValeur)
      await waitFor(() => expect(enTeteValeur).toHaveAttribute('aria-sort', 'ascending'))
      // BBB (50*5=250) < AAA (200*20=4000) < CCC (null, toujours en dernier)
      expect(tickersAffiches()).toEqual(['BBB', 'AAA', 'CCC'])

      fireEvent.click(enTeteValeur)
      await waitFor(() => expect(enTeteValeur).toHaveAttribute('aria-sort', 'descending'))
      // Sens inversé pour les valeurs connues, CCC toujours en dernier.
      expect(tickersAffiches()).toEqual(['AAA', 'BBB', 'CCC'])
    })
  })

  describe('ligne de total', () => {
    it("recalcule le nombre de lignes et la somme des valeurs selon le filtre de catégorie", async () => {
      vi.mocked(api.listHoldings).mockResolvedValue([
        holding({ id: 1, ticker: 'AAA', quantite: 10, type_actif: 'STOCK', market_data: marketData({ ticker: 'AAA', prix_actuel: 100 }) }),
        holding({ id: 2, ticker: 'BBB', quantite: 1, type_actif: 'FUND', market_data: marketData({ ticker: 'BBB', prix_actuel: 200 }) }),
      ])
      render(<PortefeuillePage />)

      function ligneTotal() {
        return screen.getAllByRole('row').at(-1)!
      }

      await screen.findByText('2 positions')
      expect(within(ligneTotal()).getByText('1 200,00 €')).toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: 'Actions' }))

      await screen.findByText('1 position')
      expect(within(ligneTotal()).getByText('1 000,00 €')).toBeInTheDocument()
    })
  })

  describe('édition en ligne (LOT 5.8)', () => {
    function positionUnique() {
      return [holding({ id: 42, ticker: 'AAA', quantite: 10, prix_revient_moyen: 100, compte: 'PEA', type_actif: 'STOCK' })]
    }

    it("le clic sur Modifier bascule en édition sans ouvrir la modale de détail", async () => {
      vi.mocked(api.listHoldings).mockResolvedValue(positionUnique())
      render(<PortefeuillePage />)

      fireEvent.click(await screen.findByRole('button', { name: 'Modifier' }))

      expect(screen.queryByTestId('modale-detail')).not.toBeInTheDocument()
      expect(screen.getByLabelText('Quantité (édition)')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeInTheDocument()
    })

    it('un clic sur la ligne en édition (hors contrôle) n\'ouvre pas la modale', async () => {
      vi.mocked(api.listHoldings).mockResolvedValue(positionUnique())
      render(<PortefeuillePage />)

      fireEvent.click(await screen.findByRole('button', { name: 'Modifier' }))
      const ligne = screen.getByText('AAA').closest('tr')
      expect(ligne).not.toBeNull()
      fireEvent.click(ligne!)

      expect(screen.queryByTestId('modale-detail')).not.toBeInTheDocument()
    })

    it('Enregistrer appelle updateHolding avec les valeurs modifiées puis recharge la liste', async () => {
      vi.mocked(api.listHoldings).mockResolvedValueOnce(positionUnique())
      vi.mocked(api.updateHolding).mockResolvedValue(holding({ id: 42, ticker: 'AAA', quantite: 15 }))
      const relue = [holding({ id: 42, ticker: 'AAA', quantite: 15, prix_revient_moyen: 100, compte: 'PEA', type_actif: 'STOCK' })]
      vi.mocked(api.listHoldings).mockResolvedValueOnce(relue)

      render(<PortefeuillePage />)
      fireEvent.click(await screen.findByRole('button', { name: 'Modifier' }))

      fireEvent.change(screen.getByLabelText('Quantité (édition)'), { target: { value: '15' } })
      fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

      await waitFor(() =>
        expect(api.updateHolding).toHaveBeenCalledWith(42, {
          quantite: 15,
          prix_revient_moyen: 100,
          compte: 'PEA',
          type_actif: 'STOCK',
        }),
      )
      await waitFor(() => expect(api.listHoldings).toHaveBeenCalledTimes(2))
    })

    it('une erreur 400 reste affichée sans quitter le mode édition', async () => {
      vi.mocked(api.listHoldings).mockResolvedValue(positionUnique())
      vi.mocked(api.updateHolding).mockRejectedValue(new Error('La quantité doit être strictement positive'))

      render(<PortefeuillePage />)
      fireEvent.click(await screen.findByRole('button', { name: 'Modifier' }))
      fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

      await screen.findByText('La quantité doit être strictement positive')
      // Toujours en édition : le champ Quantité est encore présent.
      expect(screen.getByLabelText('Quantité (édition)')).toBeInTheDocument()
    })

    it('Annuler ferme le mode édition sans appeler updateHolding', async () => {
      vi.mocked(api.listHoldings).mockResolvedValue(positionUnique())
      render(<PortefeuillePage />)

      fireEvent.click(await screen.findByRole('button', { name: 'Modifier' }))
      fireEvent.change(screen.getByLabelText('Quantité (édition)'), { target: { value: '999' } })
      fireEvent.click(screen.getByRole('button', { name: 'Annuler' }))

      expect(screen.queryByLabelText('Quantité (édition)')).not.toBeInTheDocument()
      expect(api.updateHolding).not.toHaveBeenCalled()
    })
  })
})
