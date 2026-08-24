import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { PortfolioHistoryPoint } from '../api/types'
import { PreferencesAffichageContext } from '../contexts/preferencesAffichageContextObject'
import { PERIODE_DEFAUT } from '../utils/periode'
import PortfolioHistoryChart from './PortfolioHistoryChart'

// Backlog 2.K.6 : `points`/`loading`/`error`/`onRetry` sont désormais remontés par
// `DashboardPage` (partagés avec `PatrimoineNetCard`, un seul appel réseau pour les
// deux) plutôt que chargés ici — ce fichier ne verrouille donc que le rendu à partir
// de ces props, pas un appel API.
function renderChart(props: Partial<React.ComponentProps<typeof PortfolioHistoryChart>> = {}) {
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
      <PortfolioHistoryChart points={null} loading={false} error={null} onRetry={vi.fn()} {...props} />
    </PreferencesAffichageContext.Provider>,
  )
}

function point(overrides: Partial<PortfolioHistoryPoint> = {}): PortfolioHistoryPoint {
  return { date: '2026-01-01', valeur_portefeuille: 1000, valeur_investie: 900, valeur_realisee_cumulee: 0, ...overrides }
}

describe('PortfolioHistoryChart', () => {
  it('affiche un squelette pendant le chargement', () => {
    renderChart({ loading: true, points: null })

    expect(screen.getByText(/Calcul de l'historique en cours/)).toBeInTheDocument()
  })

  it('affiche EtatErreur avec Réessayer en cas d\'échec, et appelle onRetry au clic', () => {
    const onRetry = vi.fn()
    renderChart({ loading: false, error: 'panne réseau', onRetry })

    expect(screen.getByText('panne réseau')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }))
    expect(onRetry).toHaveBeenCalled()
  })

  it("affiche un état vide quand la période active ne contient aucun point", () => {
    renderChart({ loading: false, points: [] })

    expect(screen.getByText("Pas encore d'historique disponible.")).toBeInTheDocument()
  })

  it('affiche le graphique (mode ligne par défaut) quand des points sont fournis', () => {
    renderChart({ loading: false, points: [point({ date: '2026-01-01' }), point({ date: '2026-02-01', valeur_portefeuille: 1100 })] })

    expect(screen.queryByText("Pas encore d'historique disponible.")).not.toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /Mode étagé/ })).not.toBeChecked()
  })

  it('la case "Mode étagé" bascule le graphique en aires empilées', () => {
    renderChart({ loading: false, points: [point()] })

    const case_ = screen.getByRole('checkbox', { name: /Mode étagé/ })
    fireEvent.click(case_)

    expect(case_).toBeChecked()
    expect(screen.getByText(/« Gains » inclut les ventes réalisées/)).toBeInTheDocument()
  })
})
