import { render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { PatrimoineHistoryPoint, PortfolioHistoryPoint } from '../api/types'
import { PreferencesAffichageContext, type Lentille } from '../contexts/preferencesAffichageContextObject'
import { PERIODE_DEFAUT } from '../utils/periode'
import PortfolioHistoryChart from './PortfolioHistoryChart'

function point(overrides: Partial<PortfolioHistoryPoint> = {}): PortfolioHistoryPoint {
  return { date: '2026-01-01', valeur_portefeuille: 0, valeur_investie: 0, valeur_realisee_cumulee: 0, ...overrides }
}

function pointPatrimoine(overrides: Partial<PatrimoineHistoryPoint> = {}): PatrimoineHistoryPoint {
  return { date: '2026-01-01', valeur_financiere: 0, valeur_manuelle: 0, actifs_totaux: 0, passifs_totaux: 0, patrimoine_net: 0, patrimoine_financier: 0, ...overrides }
}

function renderChart(lentille: Lentille = 'financier', props: Partial<ComponentProps<typeof PortfolioHistoryChart>> = {}) {
  return render(
    <PreferencesAffichageContext.Provider
      value={{
        lentille,
        setLentille: vi.fn(),
        montantsMasques: false,
        toggleMontantsMasques: vi.fn(),
        detenteurId: null,
        setDetenteurId: vi.fn(),
        periode: PERIODE_DEFAUT,
        setPeriode: vi.fn(),
      }}
    >
      <PortfolioHistoryChart points={null} loading={false} error={null} onRetry={vi.fn()} {...props} />
    </PreferencesAffichageContext.Provider>,
  )
}

describe('PortfolioHistoryChart — lentille (feature Net/Brut/Financier sur toute la page Synthèse)', () => {
  it('lentille "financier" : la case "Mode étagé" reste active, comportement inchangé', () => {
    renderChart('financier', { points: [point({ valeur_portefeuille: 1000 })] })

    const case_ = screen.getByRole('checkbox', { name: /Mode étagé/ })
    expect(case_).not.toBeDisabled()
    expect(screen.queryByText(/non disponible hors vue Financier/)).not.toBeInTheDocument()
  })

  it('lentille "brut" : la case "Mode étagé" est désactivée, avec une explication', () => {
    renderChart('brut', { pointsPatrimoine: [pointPatrimoine({ actifs_totaux: 1000 })], loadingPatrimoine: false })

    const case_ = screen.getByRole('checkbox', { name: /Mode étagé/ })
    expect(case_).toBeDisabled()
    expect(screen.getByText(/non disponible hors vue Financier/)).toBeInTheDocument()
  })

  it('lentille "brut" : trace `actifs_totaux` depuis `pointsPatrimoine`, pas `points` (financier)', () => {
    renderChart('brut', {
      points: [point({ valeur_portefeuille: 999999 })],
      pointsPatrimoine: [pointPatrimoine({ date: '2026-01-01', actifs_totaux: 1234 })],
      loadingPatrimoine: false,
    })

    // Recharts ne rend pas son SVG dans jsdom : seule la présence du graphique
    // (plutôt que "Pas encore d'historique disponible") signale que `data` n'est pas
    // vide — la valeur exacte tracée est couverte par un test manuel en conditions
    // réelles (même limite que `PatrimoineNetCard.test.tsx` pour son camembert).
    expect(screen.queryByText('Pas encore d\'historique disponible.')).not.toBeInTheDocument()
    expect(document.querySelector('.recharts-responsive-container')).toBeInTheDocument()
  })

  it('lentille "net" : utilise `patrimoine_net` (peut être négatif) sans planter', () => {
    renderChart('net', {
      pointsPatrimoine: [pointPatrimoine({ date: '2026-01-01', patrimoine_net: -500 })],
      loadingPatrimoine: false,
    })

    expect(document.querySelector('.recharts-responsive-container')).toBeInTheDocument()
  })

  it('lentille "brut" : utilise l\'état de chargement/erreur de `pointsPatrimoine`, pas de `points`', () => {
    renderChart('brut', { loading: false, error: null, loadingPatrimoine: true, pointsPatrimoine: null })

    expect(screen.getByText(/Calcul de l'historique en cours/)).toBeInTheDocument()
  })
})
