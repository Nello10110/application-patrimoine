import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../api/client'
import type { Detenteur, Holding, IndicateursSituation, ObjectifDetail } from '../api/types'
import ObjectifsSuivisSection from './ObjectifsSuivisSection'

vi.mock('../api/client', () => ({
  api: {
    listObjectifs: vi.fn(),
    listHoldings: vi.fn(),
    listDetenteurs: vi.fn(),
    getIndicateursSituation: vi.fn(),
    createObjectif: vi.fn(),
    deleteObjectif: vi.fn(),
  },
}))

vi.mock('../hooks/usePreferencesAffichage', () => ({
  usePreferencesAffichage: () => ({ montantsMasques: false }),
}))

function objectif(overrides: Partial<ObjectifDetail> = {}): ObjectifDetail {
  return {
    id: 1,
    nom: 'Achat résidence principale',
    type: 'immobilier',
    montant_cible: 50000,
    echeance: '2028-01-01',
    rendement_hypothese_pct: 0,
    created_at: '2026-01-01T00:00:00',
    valeur_a_la_creation: 10000,
    valeur_actuelle: 20000,
    progression_pct: 40,
    diagnostic: 'en_bonne_voie',
    retard_mois: null,
    rendement_requis_pct: 8.5,
    contribution_mensuelle_necessaire: 500,
    trajectoire_cible: [
      { date: '2026-01-01', valeur: 10000 },
      { date: '2028-01-01', valeur: 50000 },
    ],
    trajectoire_reelle: [
      { date: '2026-01-01', valeur: 10000 },
      { date: '2026-06-01', valeur: 20000 },
    ],
    actifs_rattaches: [{ holding_id: 1, ticker: 'LIVRETX', nom: 'Livret X' }],
    contributeurs: [],
    ...overrides,
  }
}

function holding(overrides: Partial<Holding> = {}): Holding {
  return {
    id: 1,
    ticker: 'LIVRETX',
    nom: 'Livret X',
    quantite: 1,
    prix_revient_moyen: 10000,
    compte: null,
    devise: null,
    type_actif: 'REGULATED_SAVINGS',
    origine: 'manuel',
    created_at: '2026-01-01T00:00:00',
    updated_at: '2026-01-01T00:00:00',
    market_data: null,
    rendement_depuis_achat_pct: null,
    rendement_annualise_pct: null,
    valeur: 20000,
    valeur_estimee: 20000,
    date_valeur_estimee: null,
    taux_pct: null,
    ...overrides,
  }
}

function detenteur(overrides: Partial<Detenteur> = {}): Detenteur {
  return { id: 1, nom: 'Alice', type: 'personne', created_at: '2026-01-01T00:00:00', updated_at: '2026-01-01T00:00:00', ...overrides }
}

function indicateurs(overrides: Partial<IndicateursSituation> = {}): IndicateursSituation {
  return {
    matelas_securite_mois: 6,
    taux_endettement_pct: 25,
    part_immobilisee_pct: 40,
    epargne_disponible: 12000,
    depenses_mensuelles_moyennes: 2000,
    mensualites_totales: 500,
    revenus_nets_mensuels_moyens: 2000,
    ...overrides,
  }
}

function mockChargement(overrides: { objectifs?: ObjectifDetail[]; holdings?: Holding[]; detenteurs?: Detenteur[]; indicateurs?: IndicateursSituation } = {}) {
  vi.mocked(api.listObjectifs).mockResolvedValue(overrides.objectifs ?? [])
  vi.mocked(api.listHoldings).mockResolvedValue(overrides.holdings ?? [holding()])
  vi.mocked(api.listDetenteurs).mockResolvedValue(overrides.detenteurs ?? [])
  vi.mocked(api.getIndicateursSituation).mockResolvedValue(overrides.indicateurs ?? indicateurs())
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ObjectifsSuivisSection — liste et diagnostic (backlog 2.O.1)', () => {
  it("affiche un état vide quand aucun objectif n'existe", async () => {
    mockChargement({ objectifs: [] })
    render(<ObjectifsSuivisSection />)

    expect(await screen.findByText("Aucun objectif suivi pour l'instant.")).toBeInTheDocument()
  })

  it('affiche les indicateurs clés et le diagnostic de chaque objectif', async () => {
    mockChargement({ objectifs: [objectif()] })
    render(<ObjectifsSuivisSection />)

    await screen.findByText('Achat résidence principale')
    expect(screen.getByText('20 000 €')).toBeInTheDocument() // valeur actuelle
    expect(screen.getByText('50 000 €')).toBeInTheDocument() // montant cible
    expect(screen.getByText('40%')).toBeInTheDocument() // progression
    expect(screen.getByText('En bonne voie.')).toBeInTheDocument()
  })

  it('affiche le retard en mois pour un objectif en retard', async () => {
    mockChargement({ objectifs: [objectif({ diagnostic: 'en_retard', retard_mois: 7 })] })
    render(<ObjectifsSuivisSection />)

    await screen.findByText('En retard de 7 mois au rythme actuel.')
  })

  it('affiche un message explicite pour un objectif atteint', async () => {
    mockChargement({ objectifs: [objectif({ diagnostic: 'atteint' })] })
    render(<ObjectifsSuivisSection />)

    await screen.findByText('Objectif atteint.')
  })

  it('supprimer un objectif demande confirmation puis appelle deleteObjectif', async () => {
    mockChargement({ objectifs: [objectif()] })
    vi.mocked(api.deleteObjectif).mockResolvedValue(undefined)
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<ObjectifsSuivisSection />)

    await screen.findByText('Achat résidence principale')
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }))

    await waitFor(() => expect(api.deleteObjectif).toHaveBeenCalledWith(1))
  })

  it('annuler la confirmation ne supprime pas', async () => {
    mockChargement({ objectifs: [objectif()] })
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<ObjectifsSuivisSection />)

    await screen.findByText('Achat résidence principale')
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }))

    expect(api.deleteObjectif).not.toHaveBeenCalled()
  })
})

describe('ObjectifsSuivisSection — création (backlog 2.O.1)', () => {
  it('créer un objectif appelle createObjectif avec les bons champs', async () => {
    mockChargement()
    vi.mocked(api.createObjectif).mockResolvedValue(objectif())
    render(<ObjectifsSuivisSection />)

    await screen.findByText('Nouvel objectif')
    fireEvent.change(screen.getByLabelText('Nom'), { target: { value: 'Précaution' } })
    fireEvent.change(screen.getByLabelText('Montant cible (€)'), { target: { value: '10000' } })
    fireEvent.change(screen.getByLabelText('Échéance'), { target: { value: '2028-01-01' } })
    fireEvent.click(screen.getByRole('button', { name: 'LIVRETX' }))
    fireEvent.click(screen.getByRole('button', { name: "Créer l'objectif" }))

    await waitFor(() =>
      expect(api.createObjectif).toHaveBeenCalledWith({
        nom: 'Précaution',
        type: 'personnalise',
        montant_cible: 10000,
        echeance: '2028-01-01',
        rendement_hypothese_pct: 0,
        holding_ids: [1],
        detenteur_ids: [],
      }),
    )
  })

  it("le bouton de création reste désactivé tant que nom/montant/échéance ne sont pas renseignés", async () => {
    mockChargement()
    render(<ObjectifsSuivisSection />)

    await screen.findByText('Nouvel objectif')
    expect(screen.getByRole('button', { name: "Créer l'objectif" })).toBeDisabled()
  })

  it('propose les contributeurs seulement si des détenteurs existent', async () => {
    mockChargement({ detenteurs: [detenteur({ nom: 'Bob' })] })
    render(<ObjectifsSuivisSection />)

    await screen.findByText('Contributeurs')
    expect(screen.getByRole('button', { name: 'Bob' })).toBeInTheDocument()
  })
})

describe('ObjectifsSuivisSection — indicateurs de situation (backlog 2.O.2)', () => {
  it('affiche les trois ratios avec leur formule', async () => {
    mockChargement({ indicateurs: indicateurs({ matelas_securite_mois: 6, taux_endettement_pct: 25, part_immobilisee_pct: 40 }) })
    render(<ObjectifsSuivisSection />)

    await screen.findByText('Indicateurs de situation')
    expect(screen.getByText('6 mois')).toBeInTheDocument()
    expect(screen.getByText('épargne disponible / dépenses mensuelles')).toBeInTheDocument()
    expect(screen.getByText('+25.0%')).toBeInTheDocument()
    expect(screen.getByText('+40.0%')).toBeInTheDocument()
  })

  it("affiche un message explicatif quand les données de budget manquent", async () => {
    mockChargement({
      indicateurs: indicateurs({ matelas_securite_mois: null, taux_endettement_pct: null, depenses_mensuelles_moyennes: null, revenus_nets_mensuels_moyens: null }),
    })
    render(<ObjectifsSuivisSection />)

    await screen.findByText(/Nécessite des mouvements bancaires importés/)
  })
})
