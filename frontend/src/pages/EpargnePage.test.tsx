import { MemoryRouter } from 'react-router-dom'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../api/client'
import type { Holding } from '../api/types'
import EpargnePage from './EpargnePage'

vi.mock('../api/client', () => ({
  api: {
    listHoldings: vi.fn(),
    createHolding: vi.fn(),
    getHoldingValuationHistory: vi.fn().mockResolvedValue([]),
    setHoldingValorisation: vi.fn(),
  },
}))

vi.mock('../hooks/usePreferencesAffichage', () => ({
  usePreferencesAffichage: () => ({ montantsMasques: false }),
}))

function holding(overrides: Partial<Holding> = {}): Holding {
  return {
    id: 1,
    ticker: 'AV1',
    nom: 'Assurance-vie Boursorama',
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
    valeur: 10000,
    valeur_estimee: 10000,
    date_valeur_estimee: '2026-01-01T00:00:00',
    taux_pct: null,
    zone_geo: null,
    versement_mensuel: 200,
    ...overrides,
  }
}

function renderPage() {
  return render(
    <MemoryRouter>
      <EpargnePage />
    </MemoryRouter>,
  )
}

describe('EpargnePage (backlog 2.S.1)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.getHoldingValuationHistory).mockResolvedValue([])
  })

  it("affiche un état vide quand aucun compte Épargne n'est enregistré", async () => {
    vi.mocked(api.listHoldings).mockResolvedValue([])

    renderPage()

    await screen.findByText('Aucun compte Épargne enregistré.')
  })

  it('affiche une erreur avec un bouton Réessayer si le chargement échoue', async () => {
    vi.mocked(api.listHoldings).mockRejectedValue(new Error('Panne réseau'))

    renderPage()

    await screen.findByText('Panne réseau')
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeInTheDocument()
  })

  it('ne liste que les 5 types couverts par TYPES_EPARGNE, pas une action ni un véhicule', async () => {
    vi.mocked(api.listHoldings).mockResolvedValue([
      holding({ id: 1, ticker: 'AV1', type_actif: 'LIFE_INSURANCE' }),
      holding({ id: 2, ticker: 'AAPL', nom: 'Apple', type_actif: 'STOCK' }),
      holding({ id: 3, ticker: 'VOITURE', nom: 'Voiture', type_actif: 'VEHICLE' }),
    ])

    renderPage()

    await screen.findByText('Assurance-vie Boursorama')
    expect(screen.queryByText('Apple')).not.toBeInTheDocument()
    expect(screen.queryByText('Voiture')).not.toBeInTheDocument()
  })

  it('affiche la valeur actuelle et le versement mensuel de chaque compte', async () => {
    vi.mocked(api.listHoldings).mockResolvedValue([holding()])

    renderPage()

    await screen.findByText('Assurance-vie Boursorama')
    // "10 000,00 €"/"200,00 €" apparaissent deux fois chacun avec un seul compte :
    // une fois dans les totaux du haut, une fois dans la carte du compte.
    expect(screen.getAllByText('10 000,00 €')).toHaveLength(2)
    expect(screen.getAllByText('200,00 €')).toHaveLength(2)
  })

  it('additionne la valeur totale et le versement mensuel total de tous les comptes', async () => {
    vi.mocked(api.listHoldings).mockResolvedValue([
      holding({ id: 1, ticker: 'AV1', valeur_estimee: 10000, versement_mensuel: 200 }),
      holding({ id: 2, ticker: 'PER1', nom: 'PER', type_actif: 'PENSION', valeur_estimee: 5000, versement_mensuel: 100 }),
    ])

    renderPage()

    await screen.findByText('Valeur totale')
    expect(screen.getByText('15 000,00 €')).toBeInTheDocument()
    expect(screen.getByText('300,00 €')).toBeInTheDocument()
  })

  it('créer un compte appelle createHolding puis recharge la liste', async () => {
    vi.mocked(api.listHoldings).mockResolvedValue([])
    vi.mocked(api.createHolding).mockResolvedValue(holding())

    renderPage()
    await screen.findByText('Aucun compte Épargne enregistré.')
    fireEvent.click(screen.getByRole('button', { name: '+ Ajouter un compte' }))

    fireEvent.change(screen.getByLabelText('Nom du compte'), { target: { value: 'Livret A' } })
    fireEvent.change(screen.getByLabelText('Valeur initiale (€, optionnel)'), { target: { value: '5000' } })
    fireEvent.click(screen.getByRole('button', { name: '+ Ajouter un compte' }))

    await vi.waitFor(() =>
      expect(api.createHolding).toHaveBeenCalledWith(
        expect.objectContaining({ nom: 'Livret A', valeur_estimee: 5000, quantite: 1 }),
      ),
    )
    await vi.waitFor(() => expect(api.listHoldings).toHaveBeenCalledTimes(2))
  })

  it('ajouter une valorisation depuis la carte du compte appelle setHoldingValorisation', async () => {
    vi.mocked(api.listHoldings).mockResolvedValue([holding()])
    vi.mocked(api.setHoldingValorisation).mockResolvedValue(holding({ valeur_estimee: 10500, date_valeur_estimee: '2026-02-01T00:00:00' }))

    renderPage()
    await screen.findByText('Assurance-vie Boursorama')
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter une valorisation' }))

    fireEvent.change(screen.getByLabelText('Valeur (€)'), { target: { value: '10500' } })
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-02-01' } })
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter une valorisation' }))

    await vi.waitFor(() => expect(api.setHoldingValorisation).toHaveBeenCalledWith('AV1', { valeur: 10500, date: '2026-02-01' }))
  })
})
