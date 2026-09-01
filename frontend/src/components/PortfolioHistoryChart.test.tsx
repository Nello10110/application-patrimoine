import { fireEvent, render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { PatrimoineHistoryPoint, PortfolioHistoryPoint } from '../api/types'
import { PreferencesAffichageContext, type Lentille } from '../contexts/preferencesAffichageContextObject'
import { PERIODE_DEFAUT } from '../utils/periode'
import PortfolioHistoryChart from './PortfolioHistoryChart'

// Backlog 2.K.6 : `points`/`loading`/`error`/`onRetry` sont désormais remontés par
// `DashboardPage` (partagés avec `PatrimoineNetCard`, un seul appel réseau pour les
// deux) plutôt que chargés ici — ce fichier ne verrouille donc que le rendu à partir
// de ces props, pas un appel API. `lentille` par défaut à "financier" (comportement
// historique de ce composant, avant la feature Net/Brut/Financier sur toute la page
// Synthèse) pour que les tests ci-dessous n'en dépendant pas restent inchangés.
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

function point(overrides: Partial<PortfolioHistoryPoint> = {}): PortfolioHistoryPoint {
  return { date: '2026-01-01', valeur_portefeuille: 1000, valeur_investie: 900, valeur_realisee_cumulee: 0, ...overrides }
}

function pointPatrimoine(overrides: Partial<PatrimoineHistoryPoint> = {}): PatrimoineHistoryPoint {
  return {
    date: '2026-01-01',
    valeur_financiere: 0,
    valeur_manuelle: 0,
    actifs_totaux: 0,
    passifs_totaux: 0,
    patrimoine_net: 0,
    patrimoine_financier: 0,
    valeur_investie: 0,
    valeur_investie_nette: 0,
    valeur_realisee_cumulee: 0,
    ...overrides,
  }
}

describe('PortfolioHistoryChart', () => {
  it('affiche un squelette pendant le chargement', () => {
    renderChart('financier', { loading: true, points: null })

    expect(screen.getByText(/Calcul de l'historique en cours/)).toBeInTheDocument()
  })

  it('affiche EtatErreur avec Réessayer en cas d\'échec, et appelle onRetry au clic', () => {
    const onRetry = vi.fn()
    renderChart('financier', { loading: false, error: 'panne réseau', onRetry })

    expect(screen.getByText('panne réseau')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }))
    expect(onRetry).toHaveBeenCalled()
  })

  it("affiche un état vide quand la période active ne contient aucun point", () => {
    renderChart('financier', { loading: false, points: [] })

    expect(screen.getByText("Pas encore d'historique disponible.")).toBeInTheDocument()
  })

  it('affiche le graphique (mode ligne par défaut) quand des points sont fournis', () => {
    renderChart('financier', { loading: false, points: [point({ date: '2026-01-01' }), point({ date: '2026-02-01', valeur_portefeuille: 1100 })] })

    expect(screen.queryByText("Pas encore d'historique disponible.")).not.toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /Mode étagé/ })).not.toBeChecked()
  })

  it('la case "Mode étagé" bascule le graphique en aires empilées', () => {
    renderChart('financier', { loading: false, points: [point()] })

    const case_ = screen.getByRole('checkbox', { name: /Mode étagé/ })
    fireEvent.click(case_)

    expect(case_).toBeChecked()
    expect(screen.getByText(/« Gains » inclut les ventes réalisées/)).toBeInTheDocument()
  })
})

describe('PortfolioHistoryChart — lentille (feature Net/Brut/Financier sur toute la page Synthèse)', () => {
  it('lentille "financier" : la case "Mode étagé" reste active, comportement inchangé', () => {
    renderChart('financier', { points: [point({ valeur_portefeuille: 1000 })] })

    const case_ = screen.getByRole('checkbox', { name: /Mode étagé/ })
    expect(case_).not.toBeDisabled()
  })

  it('lentille "brut" : la case "Mode étagé" est désormais disponible (backlog § U.3)', () => {
    renderChart('brut', { pointsPatrimoine: [pointPatrimoine({ actifs_totaux: 1000 })], loadingPatrimoine: false })

    const case_ = screen.getByRole('checkbox', { name: /Mode étagé/ })
    expect(case_).not.toBeDisabled()
  })

  it('lentille "brut" activée : affiche l\'explication propre à l\'immobilier/l\'épargne, pas celle de la carte Rentabilité', () => {
    renderChart('brut', { pointsPatrimoine: [pointPatrimoine({ actifs_totaux: 1000, valeur_investie: 800 })], loadingPatrimoine: false })

    fireEvent.click(screen.getByRole('checkbox', { name: /Mode étagé/ }))

    expect(screen.getByText(/seul un versement explicitement déclaré/)).toBeInTheDocument()
    expect(screen.queryByText(/« Gains » inclut les ventes réalisées/)).not.toBeInTheDocument()
    expect(document.querySelector('.recharts-responsive-container')).toBeInTheDocument()
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

  it('lentille "net" en mode étagé : ne plante pas (retour utilisateur 31/08/2026 — utilise `valeur_investie_nette`, jamais `valeur_investie` brute)', () => {
    renderChart('net', {
      pointsPatrimoine: [pointPatrimoine({ date: '2026-01-01', patrimoine_net: 50000, valeur_investie: 300000, valeur_investie_nette: 50000 })],
      loadingPatrimoine: false,
    })

    fireEvent.click(screen.getByRole('checkbox', { name: /Mode étagé/ }))

    expect(document.querySelector('.recharts-responsive-container')).toBeInTheDocument()
  })

  it('lentille "brut" : utilise l\'état de chargement/erreur de `pointsPatrimoine`, pas de `points`', () => {
    renderChart('brut', { loading: false, error: null, loadingPatrimoine: true, pointsPatrimoine: null })

    expect(screen.getByText(/Calcul de l'historique en cours/)).toBeInTheDocument()
  })
})
