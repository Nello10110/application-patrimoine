import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { api } from '../api/client'
import type { Detenteur, HoldingDetail, HoldingImmobilier } from '../api/types'
import HoldingDetailContent from './HoldingDetailContent'

// Ce fichier ne verrouille que la section "Détenteurs" (backlog 2.L.1) et la fiche
// immobilier (backlog 2.M.3) — le reste du composant (prix, émetteur, look-through...)
// est hors de son objet.
vi.mock('../api/client', () => ({
  api: {
    listDetenteurs: vi.fn(),
    setHoldingQuotites: vi.fn(),
    getHoldingDetail: vi.fn(),
    getHoldingPriceHistory: vi.fn().mockResolvedValue({ points: [], volatilite_annualisee_pct: null, max_drawdown_pct: null }),
    updateHoldingImmobilier: vi.fn(),
    getHoldingValuationHistory: vi.fn().mockResolvedValue([]),
  },
}))

vi.mock('../hooks/usePreferencesAffichage', () => ({
  usePreferencesAffichage: () => ({ lentille: 'net', setLentille: vi.fn(), montantsMasques: false, toggleMontantsMasques: vi.fn(), detenteurId: null, setDetenteurId: vi.fn() }),
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

function detenteur(overrides: Partial<Detenteur> = {}): Detenteur {
  return { id: 1, nom: 'Alice', type: 'personne', created_at: '2026-01-01T00:00:00', updated_at: '2026-01-01T00:00:00', ...overrides }
}

describe('HoldingDetailContent — Détenteurs (backlog 2.L.1)', () => {
  it("n'affiche aucune section Détenteurs si l'utilisateur n'a déclaré aucun détenteur", async () => {
    vi.mocked(api.listDetenteurs).mockResolvedValue([])
    render(<HoldingDetailContent detail={detail()} />)

    await vi.waitFor(() => expect(api.listDetenteurs).toHaveBeenCalled())
    expect(screen.queryByText('Détenteurs')).not.toBeInTheDocument()
  })

  it('affiche une ligne éditable par détenteur déclaré, préremplie avec les quotités existantes', async () => {
    vi.mocked(api.listDetenteurs).mockResolvedValue([detenteur({ nom: 'Alice' }), detenteur({ id: 2, nom: 'Bob' })])
    render(
      <HoldingDetailContent
        detail={detail({ quotites: [{ detenteur_id: 1, detenteur_nom: 'Alice', quotite_pct: 60, part_detenue: 900, part_nette: 900 }] })}
      />,
    )

    await screen.findByText('Détenteurs')
    // "900,00 €" apparaît deux fois : part détenue et part nette (identiques, aucun
    // emprunt rattaché à cette ligne dans ce scénario).
    expect(screen.getAllByText('900,00 €')).toHaveLength(2)
    const champAlice = screen.getByDisplayValue('60')
    expect(champAlice).toBeInTheDocument()
  })

  it('le bouton Enregistrer est désactivé tant que la somme des quotités saisies ne fait pas 100 %', async () => {
    vi.mocked(api.listDetenteurs).mockResolvedValue([detenteur({ nom: 'Alice' }), detenteur({ id: 2, nom: 'Bob' })])
    render(<HoldingDetailContent detail={detail()} />)
    await screen.findByText('Détenteurs')

    const [champAlice] = screen.getAllByRole('spinbutton')
    fireEvent.change(champAlice, { target: { value: '60' } })

    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeDisabled()
    expect(screen.getByText(/Total actuel : 60/)).toBeInTheDocument()
  })

  it('enregistrer une répartition valide appelle setHoldingQuotites puis recharge la fiche', async () => {
    vi.mocked(api.listDetenteurs).mockResolvedValue([detenteur({ nom: 'Alice' }), detenteur({ id: 2, nom: 'Bob' })])
    vi.mocked(api.setHoldingQuotites).mockResolvedValue({ ok: true })
    vi.mocked(api.getHoldingDetail).mockResolvedValue(
      detail({
        quotites: [
          { detenteur_id: 1, detenteur_nom: 'Alice', quotite_pct: 60, part_detenue: 900, part_nette: 900 },
          { detenteur_id: 2, detenteur_nom: 'Bob', quotite_pct: 40, part_detenue: 600, part_nette: 600 },
        ],
      }),
    )
    render(<HoldingDetailContent detail={detail()} />)
    await screen.findByText('Détenteurs')

    const [champAlice, champBob] = screen.getAllByRole('spinbutton')
    fireEvent.change(champAlice, { target: { value: '60' } })
    fireEvent.change(champBob, { target: { value: '40' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    await vi.waitFor(() =>
      expect(api.setHoldingQuotites).toHaveBeenCalledWith('AAPL', [
        { detenteur_id: 1, quotite_pct: 60 },
        { detenteur_id: 2, quotite_pct: 40 },
      ]),
    )
    await vi.waitFor(() => expect(screen.getAllByText('900,00 €')).toHaveLength(2))
  })
})

function immobilier(overrides: Partial<HoldingImmobilier> = {}): HoldingImmobilier {
  return {
    type_location: 'nue',
    loyer_mensuel: 1000,
    charges_mensuelles: 100,
    frais_annuels: 2400,
    surface_m2: 50,
    nb_pieces: 3,
    annee_construction: 1995,
    dpe: 'D',
    cashflow_mensuel: 700,
    rentabilite_brute_pct: 6,
    rentabilite_nette_pct: 4.2,
    prix_m2: 5000,
    emprunt_mensualite: null,
    ...overrides,
  }
}

describe('HoldingDetailContent — Fiche immobilier (backlog 2.M.3)', () => {
  it("n'affiche pas la fiche immobilier pour une position boursière", async () => {
    vi.mocked(api.listDetenteurs).mockResolvedValue([])
    render(<HoldingDetailContent detail={detail({ type_actif: 'STOCK' })} />)

    await vi.waitFor(() => expect(api.listDetenteurs).toHaveBeenCalled())
    expect(screen.queryByText('Immobilier — caractéristiques et location')).not.toBeInTheDocument()
    expect(api.getHoldingValuationHistory).not.toHaveBeenCalled()
  })

  it('affiche le formulaire de caractéristiques pour un bien immobilier, vide si aucun détail saisi', async () => {
    vi.mocked(api.listDetenteurs).mockResolvedValue([])
    render(<HoldingDetailContent detail={detail({ type_actif: 'REAL_ESTATE', immobilier: null })} />)

    await screen.findByText('Immobilier — caractéristiques et location')
    expect(screen.queryByText('Cashflow et rentabilité')).not.toBeInTheDocument()
  })

  it('affiche le cashflow, les rentabilités et le prix au m² déjà calculés', async () => {
    vi.mocked(api.listDetenteurs).mockResolvedValue([])
    render(<HoldingDetailContent detail={detail({ type_actif: 'REAL_ESTATE', immobilier: immobilier() })} />)

    await screen.findByText('Cashflow et rentabilité')
    expect(screen.getByText('700,00 €')).toBeInTheDocument()
    expect(screen.getByText('+6.0%')).toBeInTheDocument()
    expect(screen.getByText('+4.2%')).toBeInTheDocument()
    expect(screen.getByText('5 000,00 €')).toBeInTheDocument()
  })

  it('enregistrer les caractéristiques appelle updateHoldingImmobilier puis recharge la fiche', async () => {
    vi.mocked(api.listDetenteurs).mockResolvedValue([])
    vi.mocked(api.updateHoldingImmobilier).mockResolvedValue(immobilier())
    vi.mocked(api.getHoldingDetail).mockResolvedValue(detail({ type_actif: 'REAL_ESTATE', immobilier: immobilier() }))
    render(<HoldingDetailContent detail={detail({ type_actif: 'REAL_ESTATE', immobilier: null })} />)
    await screen.findByText('Immobilier — caractéristiques et location')

    fireEvent.change(screen.getByLabelText('Loyer mensuel (€)'), { target: { value: '1000' } })
    fireEvent.change(screen.getByLabelText('Surface (m²)'), { target: { value: '50' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    await vi.waitFor(() =>
      expect(api.updateHoldingImmobilier).toHaveBeenCalledWith(
        'AAPL',
        expect.objectContaining({ loyer_mensuel: 1000, surface_m2: 50 }),
      ),
    )
    await screen.findByText('Cashflow et rentabilité')
  })

  it("affiche l'historique de valorisation, la ligne la plus récente en premier", async () => {
    vi.mocked(api.listDetenteurs).mockResolvedValue([])
    vi.mocked(api.getHoldingValuationHistory).mockResolvedValue([
      { date_valeur: '2025-01-01T00:00:00', valeur: 200000 },
      { date_valeur: '2026-01-01T00:00:00', valeur: 220000 },
    ])
    render(<HoldingDetailContent detail={detail({ type_actif: 'REAL_ESTATE', immobilier: immobilier() })} />)

    await screen.findByText('Historique de valorisation')
    const lignes = screen.getAllByRole('row').slice(1) // ignore l'en-tête
    expect(within(lignes[0]).getByText('220 000,00 €')).toBeInTheDocument()
    expect(within(lignes[1]).getByText('200 000,00 €')).toBeInTheDocument()
  })
})
