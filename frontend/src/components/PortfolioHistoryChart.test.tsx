import { fireEvent, render, screen, within } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { PatrimoineHistoryPoint, PortfolioHistoryPoint } from '../api/types'
import { PreferencesAffichageContext, type Lentille } from '../contexts/preferencesAffichageContextObject'
import { PERIODE_DEFAUT, type Periode } from '../utils/periode'
import PortfolioHistoryChart, { ControlesCourbe } from './PortfolioHistoryChart'

// Backlog 2.K.6 : `points`/`loading`/`error`/`onRetry` sont désormais remontés par
// `DashboardPage` (partagés avec `PatrimoineNetCard`, un seul appel réseau pour les
// deux) plutôt que chargés ici — ce fichier ne verrouille donc que le rendu à partir
// de ces props, pas un appel API. `lentille` par défaut à "financier" (comportement
// historique de ce composant, avant la feature Net/Brut/Financier sur toute la page
// Synthèse) pour que les tests ci-dessous n'en dépendant pas restent inchangés.
function renderChart(
  lentille: Lentille = 'financier',
  props: Partial<ComponentProps<typeof PortfolioHistoryChart>> = {},
  contexte: { periode?: Periode; setPeriode?: (p: Periode) => void } = {},
) {
  return render(
    <PreferencesAffichageContext.Provider
      value={{
        lentille,
        setLentille: vi.fn(),
        montantsMasques: false,
        toggleMontantsMasques: vi.fn(),
        detenteurId: null,
        setDetenteurId: vi.fn(),
        periode: contexte.periode ?? PERIODE_DEFAUT,
        setPeriode: contexte.setPeriode ?? vi.fn(),
      }}
    >
      <PortfolioHistoryChart points={null} loading={false} error={null} onRetry={vi.fn()} stacked={false} {...props} />
    </PreferencesAffichageContext.Provider>,
  )
}

/** Les contrôles (pilule « Mode étagé », sélecteur de période) ont quitté ce
 * composant pour l'en-tête du bloc héros (maquette du 07/09/2026) : ils se testent
 * donc séparément, avec leur propre état de mode étagé. */
function renderControles(contexte: { periode?: Periode; setPeriode?: (p: Periode) => void } = {}) {
  const onStackedChange = vi.fn()
  const rendu = render(
    <PreferencesAffichageContext.Provider
      value={{
        lentille: 'financier',
        setLentille: vi.fn(),
        montantsMasques: false,
        toggleMontantsMasques: vi.fn(),
        detenteurId: null,
        setDetenteurId: vi.fn(),
        periode: contexte.periode ?? PERIODE_DEFAUT,
        setPeriode: contexte.setPeriode ?? vi.fn(),
      }}
    >
      <ControlesCourbe stacked={false} onStackedChange={onStackedChange} />
    </PreferencesAffichageContext.Provider>,
  )
  return { ...rendu, onStackedChange }
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
    expect(document.querySelector('.recharts-responsive-container')).toBeInTheDocument()
  })

  it("le mode étagé, piloté par le parent, ajoute son explication sous la courbe", () => {
    renderChart('financier', { loading: false, points: [point()], stacked: true })

    expect(screen.getByText(/« Gains » inclut les ventes réalisées/)).toBeInTheDocument()
  })
})

describe('ControlesCourbe — en-tête du bloc héros (maquette du 07/09/2026)', () => {
  it('la pilule « Mode étagé » remonte son changement au parent', () => {
    const { onStackedChange } = renderControles()

    const pilule = screen.getByRole('button', { name: /Mode étagé/ })
    expect(pilule).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(pilule)

    expect(onStackedChange).toHaveBeenCalledWith(true)
  })
})

describe('PortfolioHistoryChart — lentille (feature Net/Brut/Financier sur toute la page Synthèse)', () => {
  it('lentille "brut" en mode étagé : affiche l\'explication propre à l\'immobilier/l\'épargne, pas celle de la carte Rentabilité', () => {
    renderChart('brut', { pointsPatrimoine: [pointPatrimoine({ actifs_totaux: 1000, valeur_investie: 800 })], loadingPatrimoine: false, stacked: true })

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
      stacked: true,
    })

    expect(document.querySelector('.recharts-responsive-container')).toBeInTheDocument()
  })

  it('lentille "brut" : utilise l\'état de chargement/erreur de `pointsPatrimoine`, pas de `points`', () => {
    renderChart('brut', { loading: false, error: null, loadingPatrimoine: true, pointsPatrimoine: null })

    expect(screen.getByText(/Calcul de l'historique en cours/)).toBeInTheDocument()
  })
})

describe('PortfolioHistoryChart — période (refonte « liquid glass », étape 4)', () => {
  // Deuxième des trois décisions structurelles du paquet de design : la période est
  // pilotée SUR le graphique, plus dans la barre du haut. Elle reste la préférence
  // transverse et non un état local — le chiffre héros juste au-dessus affiche sa
  // variation sur la même période, les deux doivent raconter la même histoire.
  it('affiche le sélecteur de période, sur la valeur courante', () => {
    renderControles()

    const groupe = screen.getByRole('group', { name: 'Période du graphique' })
    expect(within(groupe).getByRole('button', { name: 'Tout' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(groupe).getByRole('button', { name: '1M' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('choisir une période écrit la préférence transverse', () => {
    const setPeriode = vi.fn()
    renderControles({ setPeriode })

    fireEvent.click(within(screen.getByRole('group', { name: 'Période du graphique' })).getByRole('button', { name: '3M' }))

    expect(setPeriode).toHaveBeenCalledWith({ type: 'relative', valeur: '3M' })
  })

  it("remet à « Tout » une période personnalisée héritée, dont l'interface n'existe plus", () => {
    const setPeriode = vi.fn()
    renderChart(
      'financier',
      { points: [point()] },
      { periode: { type: 'personnalisee', dateDebut: '2026-01-01', dateFin: '2026-02-01' }, setPeriode },
    )

    expect(setPeriode).toHaveBeenCalledWith({ type: 'relative', valeur: 'TOUT' })
  })
})
