import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { api } from '../api/client'
import type { Detenteur, Holding, HoldingDetail, HoldingImmobilier } from '../api/types'
import HoldingDetailContent from './HoldingDetailContent'

// Ce fichier verrouille la section "Détenteurs" (backlog 2.L.1), la fiche immobilier
// (backlog 2.M.3) et la structure à trois onglets (backlog 2.M.4) — le reste du
// composant (prix, émetteur, look-through...) est hors de son objet.
vi.mock('../api/client', () => ({
  api: {
    listDetenteurs: vi.fn(),
    setHoldingQuotites: vi.fn(),
    getHoldingDetail: vi.fn(),
    getHoldingPriceHistory: vi.fn().mockResolvedValue({ points: [], volatilite_annualisee_pct: null, max_drawdown_pct: null }),
    updateHoldingImmobilier: vi.fn(),
    getHoldingValuationHistory: vi.fn().mockResolvedValue([]),
    setHoldingValorisation: vi.fn(),
    updateHoldingValuationPoint: vi.fn(),
    deleteHoldingValuationPoint: vi.fn(),
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
    valeur_estimee: null,
    date_valeur_estimee: null,
    versement_mensuel: null,
    date_acquisition: null,
    ...overrides,
  }
}

function detenteur(overrides: Partial<Detenteur> = {}): Detenteur {
  return { id: 1, nom: 'Alice', type: 'personne', created_at: '2026-01-01T00:00:00', updated_at: '2026-01-01T00:00:00', ...overrides }
}

// Fiche à onglets (backlog 2.M.4) : Aperçu est l'onglet par défaut, Analyse (détenteurs,
// répartitions) et Paramètres (caractéristiques immobilières) demandent un clic.
function ouvrirOnglet(nom: string) {
  fireEvent.click(screen.getByRole('tab', { name: nom }))
}

describe('HoldingDetailContent — Détenteurs (backlog 2.L.1)', () => {
  it("n'affiche aucune section Détenteurs si l'utilisateur n'a déclaré aucun détenteur", async () => {
    vi.mocked(api.listDetenteurs).mockResolvedValue([])
    render(<HoldingDetailContent detail={detail()} />)
    ouvrirOnglet('Analyse')

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
    ouvrirOnglet('Analyse')

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
    ouvrirOnglet('Analyse')
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
    ouvrirOnglet('Analyse')
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

// `Holding` renvoyé par `updateHoldingValuationPoint`/`deleteHoldingValuationPoint`
// (backlog quickwin § T.3) — sa valeur n'est pas exploitée par `ImmobilierApercu`
// (seul `EpargneApercu`/`EpargnePage` en tirent la "valeur actuelle" resynchronisée,
// couverts ailleurs) : un objet minimal type-complet suffit ici.
function holdingApresAction(): Holding {
  return {
    id: 1,
    ticker: 'AAPL',
    nom: null,
    quantite: 1,
    prix_revient_moyen: null,
    compte: null,
    devise: null,
    type_actif: 'REAL_ESTATE',
    origine: 'manuel',
    created_at: '2026-01-01T00:00:00',
    updated_at: '2026-01-01T00:00:00',
    market_data: null,
    rendement_depuis_achat_pct: null,
    rendement_annualise_pct: null,
    valeur: null,
    valeur_estimee: 220000,
    date_valeur_estimee: '2026-01-01T00:00:00',
    taux_pct: null,
    zone_geo: null,
    versement_mensuel: null,
    date_acquisition: null,
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
    ouvrirOnglet('Paramètres')

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
    ouvrirOnglet('Paramètres')
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
    // Le résultat (cashflow/rentabilités calculés côté serveur) vit dans l'onglet
    // *Aperçu* (backlog 2.M.4), pas *Paramètres* où vit le formulaire d'édition.
    ouvrirOnglet('Aperçu')
    await screen.findByText('Cashflow et rentabilité')
  })

  it("affiche l'historique de valorisation, la ligne la plus récente en premier", async () => {
    vi.mocked(api.listDetenteurs).mockResolvedValue([])
    vi.mocked(api.getHoldingValuationHistory).mockResolvedValue([
      { id: 1, date_valeur: '2025-01-01T00:00:00', valeur: 200000 },
      { id: 2, date_valeur: '2026-01-01T00:00:00', valeur: 220000 },
    ])
    render(<HoldingDetailContent detail={detail({ type_actif: 'REAL_ESTATE', immobilier: immobilier() })} />)

    await screen.findByText('Historique de valorisation')
    const lignes = screen.getAllByRole('row').slice(1) // ignore l'en-tête
    expect(within(lignes[0]).getByText('220 000,00 €')).toBeInTheDocument()
    expect(within(lignes[1]).getByText('200 000,00 €')).toBeInTheDocument()
  })

  it("affiche un graphique d'évolution dès que l'historique compte au moins deux points (retour utilisateur 25/08)", async () => {
    vi.mocked(api.listDetenteurs).mockResolvedValue([])
    vi.mocked(api.getHoldingValuationHistory).mockResolvedValue([
      { id: 1, date_valeur: '2025-01-01T00:00:00', valeur: 200000 },
      { id: 2, date_valeur: '2026-01-01T00:00:00', valeur: 220000 },
    ])
    render(<HoldingDetailContent detail={detail({ type_actif: 'REAL_ESTATE', immobilier: immobilier() })} />)

    await screen.findByText('Historique de valorisation')
    expect(document.querySelector('.recharts-responsive-container')).toBeInTheDocument()
  })

  it("n'affiche pas de graphique pour un unique point d'historique (rien à tracer)", async () => {
    vi.mocked(api.listDetenteurs).mockResolvedValue([])
    vi.mocked(api.getHoldingValuationHistory).mockResolvedValue([{ id: 1, date_valeur: '2026-01-01T00:00:00', valeur: 220000 }])
    render(<HoldingDetailContent detail={detail({ type_actif: 'REAL_ESTATE', immobilier: immobilier() })} />)

    await screen.findByText('Historique de valorisation')
    expect(document.querySelector('.recharts-responsive-container')).not.toBeInTheDocument()
  })

  it("un unique point d'historique + une date d'acquisition antérieure affiche quand même le graphique (retour utilisateur, 26/08/2026)", async () => {
    vi.mocked(api.listDetenteurs).mockResolvedValue([])
    vi.mocked(api.getHoldingValuationHistory).mockResolvedValue([{ id: 1, date_valeur: '2026-01-01T00:00:00', valeur: 220000 }])
    render(
      <HoldingDetailContent
        detail={detail({
          type_actif: 'REAL_ESTATE',
          immobilier: immobilier(),
          date_acquisition: '2019-06-15T00:00:00',
          prix_revient_moyen: 180000,
        })}
      />,
    )

    await screen.findByText('Historique de valorisation')
    expect(document.querySelector('.recharts-responsive-container')).toBeInTheDocument()
    expect(screen.getByText(/coût d'acquisition.*ajouté au graphique/)).toBeInTheDocument()
    // Le tableau, lui, reste le reflet exact des points réellement saisis — pas de
    // ligne fabriquée à 180 000,00 €.
    const lignes = screen.getAllByRole('row').slice(1)
    expect(lignes).toHaveLength(1)
    expect(within(lignes[0]).getByText('220 000,00 €')).toBeInTheDocument()
  })

  it("une date d'acquisition POSTÉRIEURE au premier point connu n'ajoute rien (donnée déjà plus ancienne et plus fiable)", async () => {
    vi.mocked(api.listDetenteurs).mockResolvedValue([])
    vi.mocked(api.getHoldingValuationHistory).mockResolvedValue([{ id: 1, date_valeur: '2020-01-01T00:00:00', valeur: 200000 }])
    render(
      <HoldingDetailContent
        detail={detail({
          type_actif: 'REAL_ESTATE',
          immobilier: immobilier(),
          date_acquisition: '2024-06-15T00:00:00',
          prix_revient_moyen: 180000,
        })}
      />,
    )

    await screen.findByText('Historique de valorisation')
    expect(document.querySelector('.recharts-responsive-container')).not.toBeInTheDocument()
    expect(screen.queryByText(/coût d'acquisition.*ajouté au graphique/)).not.toBeInTheDocument()
  })

  it("Modifier pré-remplit le point puis Enregistrer appelle updateHoldingValuationPoint (backlog quickwin § T.3)", async () => {
    vi.mocked(api.listDetenteurs).mockResolvedValue([])
    vi.mocked(api.getHoldingValuationHistory).mockResolvedValueOnce([{ id: 7, date_valeur: '2026-01-01T00:00:00', valeur: 0 }])
    vi.mocked(api.getHoldingValuationHistory).mockResolvedValueOnce([{ id: 7, date_valeur: '2026-01-01T00:00:00', valeur: 220000 }])
    vi.mocked(api.updateHoldingValuationPoint).mockResolvedValue(holdingApresAction())
    render(<HoldingDetailContent detail={detail({ type_actif: 'REAL_ESTATE', immobilier: immobilier() })} />)

    await screen.findByText('Historique de valorisation')
    fireEvent.click(screen.getByRole('button', { name: 'Modifier' }))

    expect(screen.getByLabelText('Valeur du 01/01/2026 (édition)')).toHaveValue(0)
    expect(screen.getByLabelText('Date du 01/01/2026 (édition)')).toHaveValue('2026-01-01')
    fireEvent.change(screen.getByLabelText('Valeur du 01/01/2026 (édition)'), { target: { value: '220000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    await vi.waitFor(() => expect(api.updateHoldingValuationPoint).toHaveBeenCalledWith('AAPL', 7, { valeur: 220000, date: '2026-01-01' }))
    // Rafraîchit l'historique après coup — la nouvelle valeur remplace l'ancienne dans le tableau.
    await screen.findByText('220 000,00 €')
    expect(screen.queryByLabelText('Valeur du 01/01/2026 (édition)')).not.toBeInTheDocument()
  })

  it('Supprimer demande confirmation avant deleteHoldingValuationPoint (backlog quickwin § T.3)', async () => {
    vi.mocked(api.listDetenteurs).mockResolvedValue([])
    vi.mocked(api.getHoldingValuationHistory).mockResolvedValueOnce([{ id: 7, date_valeur: '2026-01-01T00:00:00', valeur: 220000 }])
    vi.mocked(api.getHoldingValuationHistory).mockResolvedValueOnce([])
    vi.mocked(api.deleteHoldingValuationPoint).mockResolvedValue(holdingApresAction())
    render(<HoldingDetailContent detail={detail({ type_actif: 'REAL_ESTATE', immobilier: immobilier() })} />)

    await screen.findByText('Historique de valorisation')
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }))

    const dialogue = screen.getByRole('dialog')
    expect(api.deleteHoldingValuationPoint).not.toHaveBeenCalled()
    fireEvent.click(within(dialogue).getByRole('button', { name: 'Supprimer' }))

    await vi.waitFor(() => expect(api.deleteHoldingValuationPoint).toHaveBeenCalledWith('AAPL', 7))
  })
})

describe('HoldingDetailContent — Écran Épargne, fiche détaillée (backlog 2.S.1)', () => {
  it("n'affiche pas la fiche Épargne pour un véhicule (hors périmètre, décision du 25/08/2026)", async () => {
    vi.mocked(api.listDetenteurs).mockResolvedValue([])
    // Réinitialise le compteur d'appels : ce mock n'est pas remis à zéro entre les
    // tests de ce fichier (pas de `clearMocks` global, cf. `src/test/setup.ts`), et
    // des tests précédents (fiche immobilier) l'ont déjà invoqué.
    vi.mocked(api.getHoldingValuationHistory).mockClear()
    render(<HoldingDetailContent detail={detail({ type_actif: 'VEHICLE' })} />)

    await vi.waitFor(() => expect(api.listDetenteurs).toHaveBeenCalled())
    expect(screen.queryByText('Versement mensuel déclaré')).not.toBeInTheDocument()
    expect(api.getHoldingValuationHistory).not.toHaveBeenCalled()
  })

  it("charge et affiche l'historique daté pour un compte Épargne (pas seulement l'immobilier)", async () => {
    vi.mocked(api.listDetenteurs).mockResolvedValue([])
    vi.mocked(api.getHoldingValuationHistory).mockResolvedValue([{ id: 1, date_valeur: '2026-01-01T00:00:00', valeur: 10000 }])
    render(
      <HoldingDetailContent
        detail={detail({ type_actif: 'LIFE_INSURANCE', valeur_estimee: 10000, date_valeur_estimee: '2026-01-01T00:00:00' })}
      />,
    )

    await vi.waitFor(() => expect(api.getHoldingValuationHistory).toHaveBeenCalledWith('AAPL'))
    expect(await screen.findByText('Historique de valorisation')).toBeInTheDocument()
    // "10 000,00 €" apparaît deux fois : la "Valeur actuelle" et la ligne d'historique.
    expect(screen.getAllByText('10 000,00 €')).toHaveLength(2)
  })

  it('remplace la courbe de cours par la fiche Épargne pour un type couvert par TYPES_EPARGNE', async () => {
    vi.mocked(api.listDetenteurs).mockResolvedValue([])
    render(<HoldingDetailContent detail={detail({ type_actif: 'CASH_ACCOUNT' })} />)

    expect(await screen.findByText('Versement mensuel déclaré')).toBeInTheDocument()
  })

  it('ajouter une valorisation appelle setHoldingValorisation et met à jour la valeur actuelle affichée', async () => {
    vi.mocked(api.listDetenteurs).mockResolvedValue([])
    vi.mocked(api.getHoldingValuationHistory).mockResolvedValue([])
    vi.mocked(api.setHoldingValorisation).mockResolvedValue({
      id: 1,
      ticker: 'AAPL',
      nom: 'Assurance-vie',
      quantite: 1,
      prix_revient_moyen: null,
      compte: null,
      devise: null,
      type_actif: 'LIFE_INSURANCE',
      origine: 'manuel',
      created_at: '2026-01-01T00:00:00',
      updated_at: '2026-01-01T00:00:00',
      market_data: null,
      rendement_depuis_achat_pct: null,
      rendement_annualise_pct: null,
      valeur: 12000,
      valeur_estimee: 12000,
      date_valeur_estimee: '2026-03-15T00:00:00',
      taux_pct: null,
      zone_geo: null,
      versement_mensuel: null,
      date_acquisition: null,
    })
    render(<HoldingDetailContent detail={detail({ type_actif: 'LIFE_INSURANCE', valeur_estimee: 10000 })} />)
    await screen.findByLabelText('Valeur (€)')

    fireEvent.change(screen.getByLabelText('Valeur (€)'), { target: { value: '12000' } })
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-03-15' } })
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter une valorisation' }))

    await vi.waitFor(() => expect(api.setHoldingValorisation).toHaveBeenCalledWith('AAPL', { valeur: 12000, date: '2026-03-15' }))
    expect(await screen.findByText('12 000,00 €')).toBeInTheDocument()
  })
})

describe('HoldingDetailContent — fiche à onglets (backlog 2.M.4)', () => {
  it('affiche les trois onglets, Aperçu sélectionné par défaut', async () => {
    vi.mocked(api.listDetenteurs).mockResolvedValue([])
    render(<HoldingDetailContent detail={detail()} />)

    const onglets = screen.getAllByRole('tab')
    expect(onglets.map((o) => o.textContent)).toEqual(['Aperçu', 'Analyse', 'Paramètres'])
    expect(screen.getByRole('tab', { name: 'Aperçu' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Analyse' })).toHaveAttribute('aria-selected', 'false')
  })

  it("l'onglet Aperçu affiche les indicateurs clés et la courbe de cours, pas la répartition géographique", async () => {
    vi.mocked(api.listDetenteurs).mockResolvedValue([])
    render(<HoldingDetailContent detail={detail()} />)

    expect(await screen.findByText('Prix de revient')).toBeInTheDocument()
    expect(screen.queryByText('Répartition géographique')).not.toBeInTheDocument()
  })

  it("basculer sur l'onglet Analyse affiche la répartition géographique/sectorielle et masque l'onglet Aperçu", async () => {
    vi.mocked(api.listDetenteurs).mockResolvedValue([])
    render(<HoldingDetailContent detail={detail()} />)
    ouvrirOnglet('Analyse')

    expect(await screen.findByText('Répartition géographique')).toBeInTheDocument()
    expect(screen.queryByText('Prix de revient')).not.toBeInTheDocument()
  })

  it("l'onglet Paramètres affiche un état vide explicite pour une position sans réglages éditables (ex. une action)", async () => {
    vi.mocked(api.listDetenteurs).mockResolvedValue([])
    render(<HoldingDetailContent detail={detail({ type_actif: 'STOCK' })} />)
    ouvrirOnglet('Paramètres')

    expect(await screen.findByText('Aucun paramètre modifiable pour cette ligne pour l\'instant.')).toBeInTheDocument()
  })

  it('affiche le libellé complet de la taxonomie élargie (backlog 2.M.1) dans le badge de catégorie', async () => {
    vi.mocked(api.listDetenteurs).mockResolvedValue([])
    render(<HoldingDetailContent detail={detail({ type_actif: 'REGULATED_SAVINGS' })} />)

    expect(await screen.findByText('Épargne réglementée (Livret A, LDDS...)')).toBeInTheDocument()
  })
})
