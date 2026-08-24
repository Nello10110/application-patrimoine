import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../api/client'
import type { Holding } from '../api/types'
import { simulerLargeurEcran } from '../test/matchMedia'
import PortefeuillePage from './PortefeuillePage'

vi.mock('../api/client', () => ({
  api: {
    listHoldings: vi.fn(),
    createHolding: vi.fn(),
    updateHolding: vi.fn(),
    deleteHolding: vi.fn(),
    refreshMarketData: vi.fn(),
    getRefreshStatus: vi.fn(),
    // `LoansCard` (roadmap Phase 1) est rendue par cette page mais n'est pas l'objet
    // de ce fichier — mise de côté (cf. le mock ci-dessous), donc jamais appelée en
    // pratique ; gardée ici uniquement pour que le typage de `api` reste cohérent.
    listLoans: vi.fn(),
  },
}))

// La fiche détaillée (modale) n'est pas l'objet de ce fichier : mise de côté pour ne
// vérifier que sa présence/absence (ouverture au clic sur une ligne, cf. LOT 5.8).
vi.mock('../components/HoldingDetailModal', () => ({
  default: ({ ticker }: { ticker: string }) => <div data-testid="modale-detail">{ticker}</div>,
}))

// Dettes et emprunts (roadmap Phase 1) : carte autonome avec ses propres appels API,
// hors de l'objet de ce fichier — testée séparément dans LoansCard.test.tsx.
vi.mock('../components/LoansCard', () => ({ default: () => <div /> }))

// Contrôles transverses (backlog 2.K.3) : `PositionsTable` (rendue par cette page)
// lit `usePreferencesAffichage()` (montants masqués) — non testé ici, stub neutre.
vi.mock('../hooks/usePreferencesAffichage', () => ({
  usePreferencesAffichage: () => ({ lentille: 'net', setLentille: vi.fn(), montantsMasques: false, toggleMontantsMasques: vi.fn() }),
}))

// `valeur` est calculée côté backend (LOT 6.7) : par défaut, on reproduit ici la
// même règle (prix de marché, à défaut prix de revient, `null` sinon) à partir des
// autres champs de la fixture, pour ne pas avoir à la répéter dans chaque appel de
// `holding()` — sauf si le test la surcharge explicitement.
function holding(overrides: Partial<Holding> = {}): Holding {
  const base: Holding = {
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
    valeur: null,
    valeur_estimee: null,
    date_valeur_estimee: null,
    taux_pct: null,
    zone_geo: null,
    ...overrides,
  }
  if (overrides.valeur === undefined) {
    const prix = base.market_data?.prix_actuel ?? base.prix_revient_moyen
    base.valeur = prix !== null && prix !== undefined ? prix * base.quantite : null
  }
  return base
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

  describe('Ajouter une ligne manuellement — taux annuel (backlog 2.M.1)', () => {
    it("le champ « Taux » n'apparaît pas pour un type d'actif sans taux (ex. action)", async () => {
      vi.mocked(api.listHoldings).mockResolvedValue([])
      render(<MemoryRouter><PortefeuillePage /></MemoryRouter>)
      await screen.findByText('Ajouter une ligne manuellement')

      expect(screen.queryByLabelText(/Taux d'intérêt annuel/)).not.toBeInTheDocument()
      expect(screen.queryByLabelText(/Décote annuelle/)).not.toBeInTheDocument()
    })

    it("sélectionner « Épargne réglementée » révèle le champ « Taux d'intérêt annuel »", async () => {
      vi.mocked(api.listHoldings).mockResolvedValue([])
      render(<MemoryRouter><PortefeuillePage /></MemoryRouter>)
      await screen.findByText('Ajouter une ligne manuellement')

      fireEvent.change(screen.getByLabelText("Type d'actif"), { target: { value: 'REGULATED_SAVINGS' } })

      expect(screen.getByLabelText(/Taux d'intérêt annuel/)).toBeInTheDocument()
    })

    it("sélectionner « Véhicule » révèle le champ « Décote annuelle », libellé distinct de l'épargne", async () => {
      vi.mocked(api.listHoldings).mockResolvedValue([])
      render(<MemoryRouter><PortefeuillePage /></MemoryRouter>)
      await screen.findByText('Ajouter une ligne manuellement')

      fireEvent.change(screen.getByLabelText("Type d'actif"), { target: { value: 'VEHICLE' } })

      expect(screen.getByLabelText(/Décote annuelle/)).toBeInTheDocument()
      expect(screen.queryByLabelText(/Taux d'intérêt annuel/)).not.toBeInTheDocument()
    })

    it('affiche la valeur projetée à 1 an (indicatif) une fois valeur estimée et taux renseignés', async () => {
      vi.mocked(api.listHoldings).mockResolvedValue([])
      render(<MemoryRouter><PortefeuillePage /></MemoryRouter>)
      await screen.findByText('Ajouter une ligne manuellement')

      fireEvent.change(screen.getByLabelText("Type d'actif"), { target: { value: 'REGULATED_SAVINGS' } })
      fireEvent.change(screen.getByLabelText('Valeur estimée'), { target: { value: '10000' } })
      fireEvent.change(screen.getByLabelText(/Taux d'intérêt annuel/), { target: { value: '3' } })

      await screen.findByText(/Valeur projetée dans 1 an/)
      expect(screen.getByText(/10\s?300/)).toBeInTheDocument()
    })

    it('soumettre avec un taux renseigné appelle createHolding avec taux_pct', async () => {
      vi.mocked(api.listHoldings).mockResolvedValueOnce([]).mockResolvedValue([])
      vi.mocked(api.createHolding).mockResolvedValue(
        holding({ id: 9, ticker: 'LIVRETA', quantite: 1, type_actif: 'REGULATED_SAVINGS', valeur_estimee: 10000, taux_pct: 3 }),
      )
      render(<MemoryRouter><PortefeuillePage /></MemoryRouter>)
      await screen.findByText('Ajouter une ligne manuellement')

      fireEvent.change(screen.getByPlaceholderText('AAPL'), { target: { value: 'LIVRETA' } })
      fireEvent.change(screen.getByLabelText('Quantité'), { target: { value: '1' } })
      fireEvent.change(screen.getByLabelText("Type d'actif"), { target: { value: 'REGULATED_SAVINGS' } })
      fireEvent.change(screen.getByLabelText('Valeur estimée'), { target: { value: '10000' } })
      fireEvent.change(screen.getByLabelText(/Taux d'intérêt annuel/), { target: { value: '3' } })
      fireEvent.click(screen.getByRole('button', { name: 'Ajouter' }))

      await waitFor(() =>
        expect(api.createHolding).toHaveBeenCalledWith(
          expect.objectContaining({ ticker: 'LIVRETA', type_actif: 'REGULATED_SAVINGS', valeur_estimee: 10000, taux_pct: 3 }),
        ),
      )
    })
  })

  describe('Ajouter une ligne manuellement — zone géographique (backlog 2.P.1)', () => {
    it("le champ « Zone géographique » n'apparaît pas pour un type d'actif financier (ex. action)", async () => {
      vi.mocked(api.listHoldings).mockResolvedValue([])
      render(<MemoryRouter><PortefeuillePage /></MemoryRouter>)
      await screen.findByText('Ajouter une ligne manuellement')

      expect(screen.queryByLabelText('Zone géographique')).not.toBeInTheDocument()
    })

    it("sélectionner « Immobilier » révèle le champ « Zone géographique »", async () => {
      vi.mocked(api.listHoldings).mockResolvedValue([])
      render(<MemoryRouter><PortefeuillePage /></MemoryRouter>)
      await screen.findByText('Ajouter une ligne manuellement')

      fireEvent.change(screen.getByLabelText("Type d'actif"), { target: { value: 'REAL_ESTATE' } })

      expect(screen.getByLabelText('Zone géographique')).toBeInTheDocument()
    })

    it('soumettre avec une zone sélectionnée appelle createHolding avec zone_geo', async () => {
      vi.mocked(api.listHoldings).mockResolvedValueOnce([]).mockResolvedValue([])
      vi.mocked(api.createHolding).mockResolvedValue(
        holding({ id: 9, ticker: 'MAISON', quantite: 1, type_actif: 'REAL_ESTATE', valeur_estimee: 200000, zone_geo: 'Amérique du Nord' }),
      )
      render(<MemoryRouter><PortefeuillePage /></MemoryRouter>)
      await screen.findByText('Ajouter une ligne manuellement')

      fireEvent.change(screen.getByPlaceholderText('AAPL'), { target: { value: 'MAISON' } })
      fireEvent.change(screen.getByLabelText('Quantité'), { target: { value: '1' } })
      fireEvent.change(screen.getByLabelText("Type d'actif"), { target: { value: 'REAL_ESTATE' } })
      fireEvent.change(screen.getByLabelText('Valeur estimée'), { target: { value: '200000' } })
      fireEvent.change(screen.getByLabelText('Zone géographique'), { target: { value: 'Amérique du Nord' } })
      fireEvent.click(screen.getByRole('button', { name: 'Ajouter' }))

      await waitFor(() =>
        expect(api.createHolding).toHaveBeenCalledWith(expect.objectContaining({ ticker: 'MAISON', zone_geo: 'Amérique du Nord' })),
      )
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
      render(<MemoryRouter><PortefeuillePage /></MemoryRouter>)
      const enTeteTicker = await screen.findByRole('columnheader', { name: /Ticker/ })

      fireEvent.click(enTeteTicker)
      await waitFor(() => expect(enTeteTicker).toHaveAttribute('aria-sort', 'ascending'))
      expect(tickersAffiches()).toEqual(['AAA', 'BBB', 'CCC'])

      fireEvent.click(enTeteTicker)
      await waitFor(() => expect(enTeteTicker).toHaveAttribute('aria-sort', 'descending'))
      expect(tickersAffiches()).toEqual(['CCC', 'BBB', 'AAA'])
    })

    it('trie par valeur, en repoussant les valeurs nulles (—) en fin de liste quel que soit le sens', async () => {
      render(<MemoryRouter><PortefeuillePage /></MemoryRouter>)
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
      render(<MemoryRouter><PortefeuillePage /></MemoryRouter>)

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

  describe('restitution d\'état via l\'URL (backlog 2.K.2)', () => {
    // Sonde la barre d'adresse mémorisée par `MemoryRouter` (qui ne touche jamais
    // `window.location`, contrairement à un vrai navigateur) — même technique que
    // le reste de la suite pour vérifier une navigation par `useSearchParams`.
    function SondeURL() {
      const params = new URLSearchParams(useLocation().search)
      return <p data-testid="sonde-url">{params.get('categorie') ?? '(aucune)'}</p>
    }

    it('cliquer un onglet de catégorie met à jour le paramètre `categorie` de l\'URL', async () => {
      vi.mocked(api.listHoldings).mockResolvedValue([
        holding({ id: 1, ticker: 'AAA', type_actif: 'STOCK', market_data: marketData({ ticker: 'AAA', prix_actuel: 100 }) }),
      ])
      render(
        <MemoryRouter>
          <SondeURL />
          <PortefeuillePage />
        </MemoryRouter>,
      )
      await screen.findByText('1 position')

      fireEvent.click(screen.getByRole('button', { name: 'Actions' }))

      await waitFor(() => expect(screen.getByTestId('sonde-url')).toHaveTextContent('STOCK'))
    })

    it('revenir à "Tous" retire le paramètre de l\'URL (défaut, URL propre)', async () => {
      vi.mocked(api.listHoldings).mockResolvedValue([
        holding({ id: 1, ticker: 'AAA', type_actif: 'STOCK', market_data: marketData({ ticker: 'AAA', prix_actuel: 100 }) }),
      ])
      render(
        <MemoryRouter>
          <SondeURL />
          <PortefeuillePage />
        </MemoryRouter>,
      )
      await screen.findByText('1 position')

      fireEvent.click(screen.getByRole('button', { name: 'Actions' }))
      await waitFor(() => expect(screen.getByTestId('sonde-url')).toHaveTextContent('STOCK'))
      fireEvent.click(screen.getByRole('button', { name: 'Tous' }))

      await waitFor(() => expect(screen.getByTestId('sonde-url')).toHaveTextContent('(aucune)'))
    })

    it('une URL initiale avec `?categorie=STOCK` présélectionne l\'onglet correspondant', async () => {
      vi.mocked(api.listHoldings).mockResolvedValue([
        holding({ id: 1, ticker: 'AAA', type_actif: 'STOCK', market_data: marketData({ ticker: 'AAA', prix_actuel: 100 }) }),
        holding({ id: 2, ticker: 'BBB', type_actif: 'FUND', market_data: marketData({ ticker: 'BBB', prix_actuel: 100 }) }),
      ])
      render(
        <MemoryRouter initialEntries={['/patrimoine?categorie=STOCK']}>
          <PortefeuillePage />
        </MemoryRouter>,
      )

      await screen.findByText('1 position')
      expect(screen.getByText('AAA')).toBeInTheDocument()
      expect(screen.queryByText('BBB')).not.toBeInTheDocument()
    })
  })

  describe('filtre par catégorie : obligations et private equity distinguées de "Autres"', () => {
    it('BOND et PRIVATE_FUND ont leur propre onglet, "Autres" ne garde que le type non précisé', async () => {
      vi.mocked(api.listHoldings).mockResolvedValue([
        holding({ id: 1, ticker: 'AAA', type_actif: 'BOND', market_data: marketData({ ticker: 'AAA', prix_actuel: 100 }) }),
        holding({ id: 2, ticker: 'BBB', type_actif: 'PRIVATE_FUND', market_data: marketData({ ticker: 'BBB', prix_actuel: 100 }) }),
        holding({ id: 3, ticker: 'CCC', type_actif: null, market_data: marketData({ ticker: 'CCC', prix_actuel: 100 }) }),
      ])
      render(<MemoryRouter><PortefeuillePage /></MemoryRouter>)

      await screen.findByText('3 positions')

      fireEvent.click(screen.getByRole('button', { name: 'Obligations' }))
      await screen.findByText('1 position')
      expect(screen.getByText('AAA')).toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: 'Private Equity' }))
      await screen.findByText('1 position')
      expect(screen.getByText('BBB')).toBeInTheDocument()

      // "Autres" ne garde que la ligne sans type précisé : BOND/PRIVATE_FUND n'y
      // basculent plus (avant cet ajout, les deux y auraient été rangées).
      fireEvent.click(screen.getByRole('button', { name: 'Autres' }))
      await screen.findByText('1 position')
      expect(screen.getByText('CCC')).toBeInTheDocument()
    })
  })

  describe('filtre par compte (LOT 5.1)', () => {
    it('se combine au filtre de catégorie et met à jour la ligne de total', async () => {
      vi.mocked(api.listHoldings).mockResolvedValue([
        holding({ id: 1, ticker: 'AAA', quantite: 10, compte: 'PEA', type_actif: 'STOCK', market_data: marketData({ ticker: 'AAA', prix_actuel: 100 }) }),
        holding({ id: 2, ticker: 'BBB', quantite: 1, compte: 'CTO', type_actif: 'STOCK', market_data: marketData({ ticker: 'BBB', prix_actuel: 200 }) }),
        holding({ id: 3, ticker: 'CCC', quantite: 1, compte: 'PEA', type_actif: 'FUND', market_data: marketData({ ticker: 'CCC', prix_actuel: 300 }) }),
        holding({ id: 4, ticker: 'DDD', quantite: 1, compte: null, type_actif: 'STOCK', market_data: marketData({ ticker: 'DDD', prix_actuel: 50 }) }),
      ])
      render(<MemoryRouter><PortefeuillePage /></MemoryRouter>)

      await screen.findByText('4 positions')

      const selecteurCompte = screen.getByLabelText('Filtrer par compte')
      // Toutes les valeurs présentes, plus "Sans compte" car une ligne n'est pas annotée.
      const options = Array.from(selecteurCompte.querySelectorAll('option')).map((o) => o.textContent)
      expect(options).toEqual(['Tous les comptes', 'CTO', 'PEA', 'Sans compte'])

      fireEvent.change(selecteurCompte, { target: { value: 'PEA' } })
      await screen.findByText('2 positions') // AAA + CCC, toutes deux PEA

      // Combiné au filtre de catégorie : PEA + Actions -> seule AAA reste.
      fireEvent.click(screen.getByRole('button', { name: 'Actions' }))
      await screen.findByText('1 position')

      fireEvent.click(screen.getByRole('button', { name: 'Tous' }))
      fireEvent.change(selecteurCompte, { target: { value: 'SANS_COMPTE' } })
      await screen.findByText('1 position') // seule DDD n'a pas de compte
    })
  })

  describe('filtre sans résultat (backlog 2.K.5)', () => {
    it('affiche un message explicite et un bouton de réinitialisation, distinct du vide global', async () => {
      vi.mocked(api.listHoldings).mockResolvedValue([
        holding({ id: 1, ticker: 'AAA', compte: 'PEA', type_actif: 'STOCK', market_data: marketData({ ticker: 'AAA', prix_actuel: 100 }) }),
      ])
      render(<MemoryRouter><PortefeuillePage /></MemoryRouter>)
      await screen.findByText('1 position')

      fireEvent.click(screen.getByRole('button', { name: 'Private Equity' }))

      expect(await screen.findByText('Aucune position ne correspond à ce filtre.')).toBeInTheDocument()
      expect(screen.queryByText('Aucune position. Ajoute une ligne ou importe un fichier.')).not.toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: 'Réinitialiser les filtres' }))

      await screen.findByText('AAA')
    })
  })

  describe('filtres — feuille glissante mobile (backlog 2.K.4)', () => {
    function deuxPositions() {
      return [
        holding({ id: 1, ticker: 'AAA', compte: 'PEA', type_actif: 'STOCK', market_data: marketData({ ticker: 'AAA', prix_actuel: 100 }) }),
        holding({ id: 2, ticker: 'BBB', compte: 'CTO', type_actif: 'FUND', market_data: marketData({ ticker: 'BBB', prix_actuel: 100 }) }),
      ]
    }

    it('le bouton "Filtrer" ouvre une feuille avec les mêmes contrôles que la barre desktop', async () => {
      vi.mocked(api.listHoldings).mockResolvedValue(deuxPositions())
      render(<MemoryRouter><PortefeuillePage /></MemoryRouter>)
      await screen.findByText('2 positions')

      fireEvent.click(screen.getByRole('button', { name: /^Filtrer/ }))

      const feuille = await screen.findByRole('dialog')
      expect(within(feuille).getByRole('button', { name: 'Actions' })).toBeInTheDocument()
      expect(within(feuille).getByText('Filtrer par compte')).toBeInTheDocument()
    })

    it('choisir une catégorie dans la feuille filtre la liste, comme la barre desktop', async () => {
      vi.mocked(api.listHoldings).mockResolvedValue(deuxPositions())
      render(<MemoryRouter><PortefeuillePage /></MemoryRouter>)
      await screen.findByText('2 positions')

      fireEvent.click(screen.getByRole('button', { name: /^Filtrer/ }))
      const feuille = await screen.findByRole('dialog')
      fireEvent.click(within(feuille).getByRole('button', { name: 'ETF' }))

      await screen.findByText('BBB')
      expect(screen.queryByText('AAA')).not.toBeInTheDocument()
    })

    it('un point apparaît sur le déclencheur quand un filtre est actif', async () => {
      vi.mocked(api.listHoldings).mockResolvedValue(deuxPositions())
      render(<MemoryRouter><PortefeuillePage /></MemoryRouter>)
      await screen.findByText('2 positions')
      const declencheur = screen.getByRole('button', { name: /^Filtrer/ })
      expect(declencheur.querySelector('.bg-accent')).not.toBeInTheDocument()

      fireEvent.click(declencheur)
      const feuille = await screen.findByRole('dialog')
      fireEvent.click(within(feuille).getByRole('button', { name: 'ETF' }))

      expect(screen.getByRole('button', { name: /^Filtrer/ }).querySelector('.bg-accent')).toBeInTheDocument()
    })

    it('le bouton "Voir N positions" ferme la feuille sans changer le filtre', async () => {
      vi.mocked(api.listHoldings).mockResolvedValue(deuxPositions())
      render(<MemoryRouter><PortefeuillePage /></MemoryRouter>)
      await screen.findByText('2 positions')

      fireEvent.click(screen.getByRole('button', { name: /^Filtrer/ }))
      await screen.findByRole('dialog')

      fireEvent.click(screen.getByRole('button', { name: /^Voir 2 positions$/ }))

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      expect(screen.getByText('2 positions')).toBeInTheDocument()
    })
  })

  describe('PositionsTable — cartes sur mobile (backlog 2.K.4)', () => {
    beforeEach(() => simulerLargeurEcran(true))

    function positionUnique() {
      return [
        holding({
          id: 42,
          ticker: 'AAA',
          quantite: 10,
          prix_revient_moyen: 100,
          compte: 'PEA',
          type_actif: 'STOCK',
          rendement_depuis_achat_pct: 12.5,
          market_data: marketData({ ticker: 'AAA', prix_actuel: 150, secteur: 'Technologie', pays: 'France' }),
        }),
      ]
    }

    it('affiche une carte par position (pas de tableau) avec ses informations clés', async () => {
      vi.mocked(api.listHoldings).mockResolvedValue(positionUnique())
      render(<MemoryRouter><PortefeuillePage /></MemoryRouter>)

      await screen.findByText('AAA')
      expect(screen.queryByRole('table')).not.toBeInTheDocument()
      expect(screen.getByText('Technologie')).toBeInTheDocument()
      expect(screen.getByText('France')).toBeInTheDocument()
      expect(screen.getByText('+12.5%')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Modifier' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Supprimer' })).toBeInTheDocument()
    })

    it('« Modifier » ouvre un formulaire empilé (pas de ligne développée), « Enregistrer » appelle updateHolding', async () => {
      vi.mocked(api.listHoldings).mockResolvedValueOnce(positionUnique())
      vi.mocked(api.updateHolding).mockResolvedValue(holding({ id: 42, ticker: 'AAA', quantite: 15 }))
      vi.mocked(api.listHoldings).mockResolvedValueOnce(positionUnique())
      render(<MemoryRouter><PortefeuillePage /></MemoryRouter>)
      await screen.findByText('AAA')

      fireEvent.click(screen.getByRole('button', { name: 'Modifier' }))
      expect(screen.getByLabelText('Quantité (édition)')).toBeInTheDocument()
      fireEvent.change(screen.getByLabelText('Quantité (édition)'), { target: { value: '15' } })
      fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

      await waitFor(() => expect(api.updateHolding).toHaveBeenCalledWith(42, expect.objectContaining({ quantite: 15 })))
    })

    it('le tri se fait via un sélecteur (pas de colonnes cliquables)', async () => {
      vi.mocked(api.listHoldings).mockResolvedValue([
        holding({ id: 1, ticker: 'BBB', quantite: 1, origine: 'reconstruit', market_data: marketData({ ticker: 'BBB' }) }),
        holding({ id: 2, ticker: 'AAA', quantite: 1, origine: 'reconstruit', market_data: marketData({ ticker: 'AAA' }) }),
      ])
      render(<MemoryRouter><PortefeuillePage /></MemoryRouter>)
      await screen.findByText('BBB')

      fireEvent.change(screen.getByLabelText('Trier par'), { target: { value: 'ticker' } })

      const tickers = screen.getAllByText(/^(AAA|BBB)$/).map((el) => el.textContent)
      expect(tickers.indexOf('AAA')).toBeLessThan(tickers.indexOf('BBB'))
    })
  })

  describe('édition en ligne (LOT 5.8)', () => {
    function positionUnique() {
      return [holding({ id: 42, ticker: 'AAA', quantite: 10, prix_revient_moyen: 100, compte: 'PEA', type_actif: 'STOCK' })]
    }

    it("le clic sur Modifier bascule en édition sans ouvrir la modale de détail", async () => {
      vi.mocked(api.listHoldings).mockResolvedValue(positionUnique())
      render(<MemoryRouter><PortefeuillePage /></MemoryRouter>)

      fireEvent.click(await screen.findByRole('button', { name: 'Modifier' }))

      expect(screen.queryByTestId('modale-detail')).not.toBeInTheDocument()
      expect(screen.getByLabelText('Quantité (édition)')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeInTheDocument()
    })

    it('un clic sur la ligne en édition (hors contrôle) n\'ouvre pas la modale', async () => {
      vi.mocked(api.listHoldings).mockResolvedValue(positionUnique())
      render(<MemoryRouter><PortefeuillePage /></MemoryRouter>)

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

      render(<MemoryRouter><PortefeuillePage /></MemoryRouter>)
      fireEvent.click(await screen.findByRole('button', { name: 'Modifier' }))

      fireEvent.change(screen.getByLabelText('Quantité (édition)'), { target: { value: '15' } })
      fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

      await waitFor(() =>
        expect(api.updateHolding).toHaveBeenCalledWith(42, {
          quantite: 15,
          prix_revient_moyen: 100,
          compte: 'PEA',
          type_actif: 'STOCK',
          valeur_estimee: null,
          taux_pct: null,
        }),
      )
      await waitFor(() => expect(api.listHoldings).toHaveBeenCalledTimes(2))
    })

    it('une erreur 400 reste affichée sans quitter le mode édition', async () => {
      vi.mocked(api.listHoldings).mockResolvedValue(positionUnique())
      vi.mocked(api.updateHolding).mockRejectedValue(new Error('La quantité doit être strictement positive'))

      render(<MemoryRouter><PortefeuillePage /></MemoryRouter>)
      fireEvent.click(await screen.findByRole('button', { name: 'Modifier' }))
      fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

      await screen.findByText('La quantité doit être strictement positive')
      // Toujours en édition : le champ Quantité est encore présent.
      expect(screen.getByLabelText('Quantité (édition)')).toBeInTheDocument()
    })

    it('Annuler ferme le mode édition sans appeler updateHolding', async () => {
      vi.mocked(api.listHoldings).mockResolvedValue(positionUnique())
      render(<MemoryRouter><PortefeuillePage /></MemoryRouter>)

      fireEvent.click(await screen.findByRole('button', { name: 'Modifier' }))
      fireEvent.change(screen.getByLabelText('Quantité (édition)'), { target: { value: '999' } })
      fireEvent.click(screen.getByRole('button', { name: 'Annuler' }))

      expect(screen.queryByLabelText('Quantité (édition)')).not.toBeInTheDocument()
      expect(api.updateHolding).not.toHaveBeenCalled()
    })
  })

  describe('suppression (LOT 6.3 : modale de confirmation, plus de confirm() natif)', () => {
    function positionUnique() {
      return [holding({ id: 42, ticker: 'AAA' })]
    }

    it('le clic sur Supprimer ouvre une modale nommant la ligne, sans appeler deleteHolding', async () => {
      vi.mocked(api.listHoldings).mockResolvedValue(positionUnique())
      render(<MemoryRouter><PortefeuillePage /></MemoryRouter>)

      fireEvent.click(await screen.findByRole('button', { name: 'Supprimer' }))

      const modale = await screen.findByRole('dialog')
      expect(within(modale).getByText('AAA')).toBeInTheDocument()
      expect(api.deleteHolding).not.toHaveBeenCalled()
    })

    it('Annuler ferme la modale sans appeler deleteHolding', async () => {
      vi.mocked(api.listHoldings).mockResolvedValue(positionUnique())
      render(<MemoryRouter><PortefeuillePage /></MemoryRouter>)

      fireEvent.click(await screen.findByRole('button', { name: 'Supprimer' }))
      await screen.findByRole('dialog')
      fireEvent.click(screen.getByRole('button', { name: 'Annuler' }))

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(api.deleteHolding).not.toHaveBeenCalled()
    })

    it('confirmer dans la modale appelle deleteHolding puis recharge la liste', async () => {
      vi.mocked(api.listHoldings).mockResolvedValueOnce(positionUnique())
      vi.mocked(api.deleteHolding).mockResolvedValue({ ok: true })
      vi.mocked(api.listHoldings).mockResolvedValueOnce([])

      render(<MemoryRouter><PortefeuillePage /></MemoryRouter>)
      fireEvent.click(await screen.findByRole('button', { name: 'Supprimer' }))
      const modale = await screen.findByRole('dialog')
      // Deux boutons "Supprimer" à l'écran une fois la modale ouverte (celui de la
      // ligne, sous la modale, et celui de confirmation) : on cible celui de la modale.
      fireEvent.click(within(modale).getByRole('button', { name: 'Supprimer' }))

      await waitFor(() => expect(api.deleteHolding).toHaveBeenCalledWith(42))
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      await waitFor(() => expect(api.listHoldings).toHaveBeenCalledTimes(2))
    })
  })
})
