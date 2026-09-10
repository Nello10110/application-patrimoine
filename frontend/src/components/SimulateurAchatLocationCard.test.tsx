import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../api/client'
import type { Holding, HoldingDetail, HoldingImmobilier, Loan } from '../api/types'
import SimulateurAchatLocationCard from './SimulateurAchatLocationCard'

function renderCard() {
  return render(
    <MemoryRouter>
      <SimulateurAchatLocationCard />
    </MemoryRouter>,
  )
}

vi.mock('../api/client', () => ({
  api: {
    listHoldings: vi.fn(),
    listLoans: vi.fn(),
    getHoldingDetail: vi.fn(),
  },
}))

vi.mock('../hooks/usePreferencesAffichage', () => ({
  usePreferencesAffichage: () => ({ lentille: 'net', setLentille: vi.fn(), montantsMasques: false, toggleMontantsMasques: vi.fn(), detenteurId: null, setDetenteurId: vi.fn() }),
}))

function holding(overrides: Partial<Holding> = {}): Holding {
  return {
    id: 1,
    ticker: 'MAISON',
    nom: 'Maison principale',
    quantite: 1,
    prix_revient_moyen: 200000,
    cout_acquisition_total: 200000,
    compte: null,
    devise: null,
    type_actif: 'REAL_ESTATE',
    origine: 'manuel',
    created_at: '2020-01-01T00:00:00',
    updated_at: '2020-01-01T00:00:00',
    market_data: null,
    rendement_depuis_achat_pct: null,
    rendement_annualise_pct: null,
    valeur: 250000,
    valeur_estimee: null,
    date_valeur_estimee: null,
    taux_pct: null,
    zone_geo: null,
    versement_mensuel: null,
    date_acquisition: null,
    ...overrides,
  }
}

function immobilier(overrides: Partial<HoldingImmobilier> = {}): HoldingImmobilier {
  return {
    type_location: null,
    loyer_mensuel: null,
    charges_mensuelles: null,
    frais_annuels: null,
    frais_notaire: null,
    frais_travaux: null,
    frais_acquisition_autres: null,
    surface_m2: null,
    nb_pieces: null,
    annee_construction: null,
    dpe: null,
    residence_principale: true,
    simulation_loyer_estime: null,
    simulation_taxe_habitation_annuelle: null,
    simulation_charges_mensuelles: null,
    cashflow_mensuel: null,
    rentabilite_brute_pct: null,
    rentabilite_nette_pct: null,
    prix_m2: null,
    emprunt_mensualite: null,
    prix_acquisition_total: null,
    ...overrides,
  }
}

function detail(ticker: string, nom: string, immo: HoldingImmobilier | null): HoldingDetail {
  return {
    ticker,
    nom,
    type_actif: 'REAL_ESTATE',
    compte: null,
    quantite: 1,
    prix_revient_moyen: 200000,
    cout_acquisition_total: 200000,
    prix_actuel: null,
    valeur: 250000,
    devise: null,
    secteur: null,
    pays: null,
    rendement_depuis_achat_pct: null,
    rendement_annualise_pct: null,
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
    immobilier: immo,
    valeur_estimee: null,
    date_valeur_estimee: null,
    versement_mensuel: null,
    date_acquisition: null,
  }
}

function loan(overrides: Partial<Loan> = {}): Loan {
  return {
    id: 1,
    libelle: 'Crédit immobilier',
    capital_initial: 200000,
    taux_annuel_pct: 3.6,
    mensualite: 900,
    date_debut: '2020-01-01T00:00:00',
    duree_mois: 240,
    capital_restant_du_manuel: null,
    derniere_maj_manuelle: null,
    capital_restant_du: 100000,
    holding_id: 1,
    etablissement_id: null,
    created_at: '2020-01-01T00:00:00',
    updated_at: '2020-01-01T00:00:00',
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('SimulateurAchatLocationCard', () => {
  it("affiche un état vide avec un bouton d'ajout quand aucun bien immobilier n'existe (retour utilisateur du 10/09/2026)", async () => {
    vi.mocked(api.listHoldings).mockResolvedValue([holding({ ticker: 'AAPL', type_actif: 'STOCK' })])
    vi.mocked(api.listLoans).mockResolvedValue([])

    renderCard()

    expect(await screen.findByText('Aucun bien immobilier enregistré')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ajouter un bien immobilier' })).toHaveAttribute('href', '/patrimoine')
    expect(api.getHoldingDetail).not.toHaveBeenCalled()
  })

  it("affiche un lien pour configurer le bien quand il existe mais n'est pas marqué résidence principale (retour utilisateur du 10/09/2026)", async () => {
    vi.mocked(api.listHoldings).mockResolvedValue([holding()])
    vi.mocked(api.listLoans).mockResolvedValue([])
    vi.mocked(api.getHoldingDetail).mockResolvedValue(detail('MAISON', 'Maison principale', immobilier({ residence_principale: false })))

    renderCard()

    expect(await screen.findByText('Aucune résidence principale configurée')).toBeInTheDocument()
    const lien = screen.getByRole('link', { name: 'Configurer « Maison principale »' })
    expect(lien).toHaveAttribute('href', '/patrimoine/MAISON?onglet=parametres')
  })

  it("liste un lien par bien quand plusieurs biens existent sans résidence principale marquée", async () => {
    vi.mocked(api.listHoldings).mockResolvedValue([holding({ id: 1, ticker: 'MAISON1' }), holding({ id: 2, ticker: 'MAISON2' })])
    vi.mocked(api.listLoans).mockResolvedValue([])
    vi.mocked(api.getHoldingDetail).mockImplementation((ticker: string) =>
      Promise.resolve(detail(ticker, ticker === 'MAISON1' ? 'Bien A' : 'Bien B', immobilier({ residence_principale: false }))),
    )

    renderCard()

    expect(await screen.findByRole('link', { name: 'Configurer « Bien A »' })).toHaveAttribute('href', '/patrimoine/MAISON1?onglet=parametres')
    expect(screen.getByRole('link', { name: 'Configurer « Bien B »' })).toHaveAttribute('href', '/patrimoine/MAISON2?onglet=parametres')
  })

  it('affiche un lien pour configurer le simulateur quand la fiche est incomplète', async () => {
    vi.mocked(api.listHoldings).mockResolvedValue([holding()])
    vi.mocked(api.listLoans).mockResolvedValue([])
    vi.mocked(api.getHoldingDetail).mockResolvedValue(detail('MAISON', 'Maison principale', immobilier({ simulation_loyer_estime: null })))

    renderCard()

    expect(await screen.findByText('Simulateur non configuré')).toBeInTheDocument()
    expect(screen.getByText(/Maison principale/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Configurer le simulateur' })).toHaveAttribute('href', '/patrimoine/MAISON?onglet=parametres')
  })

  it('calcule l’écart avec un emprunt rattaché : seule la part d’intérêts compte', async () => {
    vi.mocked(api.listHoldings).mockResolvedValue([holding()])
    vi.mocked(api.listLoans).mockResolvedValue([loan()])
    vi.mocked(api.getHoldingDetail).mockResolvedValue(
      detail(
        'MAISON',
        'Maison principale',
        immobilier({
          simulation_loyer_estime: 1200,
          simulation_taxe_habitation_annuelle: 1200, // 100 €/mois
          simulation_charges_mensuelles: 150,
          frais_notaire: 10000,
          frais_travaux: 5000,
        }),
      ),
    )

    renderCard()

    // Intérêts = 100 000 × (3.6 % / 12) = 300 €/mois ; coût = 300 + 150 + 100 = 550 €/mois
    await screen.findByText(/550/)
    // Écart = 1200 − 550 = 650 €/mois, positif : posséder coûte moins cher.
    expect(await screen.findByText(/650/)).toBeInTheDocument()
    expect(screen.getByText('Posséder coûte moins cher que louer')).toBeInTheDocument()
    // Frais d'acquisition = 15 000 €, informatifs, séparés de la comparaison mensuelle.
    expect(screen.getByText(/Frais d'acquisition versés/)).toBeInTheDocument()
  })

  it('sans emprunt rattaché (achat cash), le coût de possession ne compte aucun intérêt', async () => {
    vi.mocked(api.listHoldings).mockResolvedValue([holding()])
    vi.mocked(api.listLoans).mockResolvedValue([]) // pas d'emprunt
    vi.mocked(api.getHoldingDetail).mockResolvedValue(
      detail(
        'MAISON',
        'Maison principale',
        immobilier({ simulation_loyer_estime: 1200, simulation_taxe_habitation_annuelle: 1200, simulation_charges_mensuelles: 150 }),
      ),
    )

    renderCard()

    // Coût = 0 (pas d'intérêt) + 150 + 100 = 250 €/mois.
    expect(await screen.findByText(/250/)).toBeInTheDocument()
    expect(screen.getByText(/pas d'emprunt rattaché/)).toBeInTheDocument()
  })

  it('propose un sélecteur quand plusieurs résidences principales existent', async () => {
    vi.mocked(api.listHoldings).mockResolvedValue([holding({ id: 1, ticker: 'MAISON1' }), holding({ id: 2, ticker: 'MAISON2' })])
    vi.mocked(api.listLoans).mockResolvedValue([])
    vi.mocked(api.getHoldingDetail).mockImplementation((ticker: string) =>
      Promise.resolve(
        detail(ticker, ticker === 'MAISON1' ? 'Ancienne résidence' : 'Nouvelle résidence', immobilier({ simulation_loyer_estime: 1000 })),
      ),
    )

    renderCard()

    const select = await screen.findByLabelText('Bien')
    expect(select).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Ancienne résidence' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Nouvelle résidence' })).toBeInTheDocument()

    fireEvent.change(select, { target: { value: 'MAISON2' } })

    await waitFor(() => expect((select as HTMLSelectElement).value).toBe('MAISON2'))
  })
})
