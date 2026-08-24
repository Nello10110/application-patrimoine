import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { api } from '../api/client'
import type { RevenusPassifsProjetes } from '../api/types'
import { PreferencesAffichageContext } from '../contexts/preferencesAffichageContextObject'
import { PERIODE_DEFAUT } from '../utils/periode'
import RevenusPassifsCard from './RevenusPassifsCard'

vi.mock('../api/client', () => ({
  api: {
    getRevenusPassifs: vi.fn(),
  },
}))

function revenus(overrides: Partial<RevenusPassifsProjetes> = {}): RevenusPassifsProjetes {
  return {
    loyers_nets_annuels: 0,
    interets_livrets_annuels: 0,
    revenu_certain_annuel: 0,
    dividendes_estimes_annuels: 0,
    interets_courtage_estimes_annuels: 0,
    revenu_estime_annuel: 0,
    revenu_total_projete_annuel: 0,
    revenu_total_projete_mensuel: 0,
    ...overrides,
  }
}

function renderCard() {
  return render(
    <PreferencesAffichageContext.Provider
      value={{
        lentille: 'net',
        setLentille: vi.fn(),
        montantsMasques: false,
        toggleMontantsMasques: vi.fn(),
        detenteurId: null,
        setDetenteurId: vi.fn(),
        periode: PERIODE_DEFAUT,
        setPeriode: vi.fn(),
      }}
    >
      <RevenusPassifsCard />
    </PreferencesAffichageContext.Provider>,
  )
}

describe('RevenusPassifsCard', () => {
  it('affiche un état vide quand aucun revenu passif n’est détecté', async () => {
    vi.mocked(api.getRevenusPassifs).mockResolvedValue(revenus())
    renderCard()

    await screen.findByText('Aucun revenu passif détecté.')
  })

  it('affiche la projection totale et la répartition certain/estimé', async () => {
    vi.mocked(api.getRevenusPassifs).mockResolvedValue(
      revenus({
        loyers_nets_annuels: 9600,
        interets_livrets_annuels: 300,
        revenu_certain_annuel: 9900,
        dividendes_estimes_annuels: 45,
        interets_courtage_estimes_annuels: 20,
        revenu_estime_annuel: 65,
        revenu_total_projete_annuel: 9965,
        revenu_total_projete_mensuel: 830.42,
      }),
    )
    renderCard()

    await screen.findByText('9 965 €')
    expect(screen.getByText('830 €')).toBeInTheDocument()
    expect(screen.getByText('9 600 €')).toBeInTheDocument()
    expect(screen.getByText('300 €')).toBeInTheDocument()
    expect(screen.getByText('45 €')).toBeInTheDocument()
    expect(screen.getByText('20 €')).toBeInTheDocument()
  })

  it('affiche une erreur avec bouton Réessayer si le chargement échoue', async () => {
    vi.mocked(api.getRevenusPassifs).mockRejectedValueOnce(new Error('panne simulée'))
    renderCard()

    await screen.findByText('panne simulée')
  })
})
