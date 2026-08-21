import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { AllocationBreakdownItem } from '../api/types'
import AllocationChartCard from './AllocationChartCard'

// Contrôles transverses (backlog 2.K.3) : `AllocationChartCard` lit
// `usePreferencesAffichage()` (montants masqués) — non testé ici, stub neutre.
vi.mock('../hooks/usePreferencesAffichage', () => ({
  usePreferencesAffichage: () => ({ lentille: 'net', setLentille: vi.fn(), montantsMasques: false, toggleMontantsMasques: vi.fn() }),
}))

// Graphiques recharts mis de côté (LOT 6.10) : ce fichier ne verrouille que la
// bascule barres/camembert, le plein écran et le tableau détaillé — pas le rendu
// recharts lui-même (déjà couvert ailleurs, cf. `AllocationBarChart`/`AllocationPieChart`).
vi.mock('./AllocationBarChart', () => ({
  default: ({ items }: { items: AllocationBreakdownItem[] }) => <div data-testid="bar-chart">{items.length}</div>,
}))
vi.mock('./AllocationPieChart', () => ({
  default: ({ items }: { items: AllocationBreakdownItem[] }) => <div data-testid="pie-chart">{items.length}</div>,
}))

const ITEMS: AllocationBreakdownItem[] = [
  { categorie: 'Europe', valeur: 6000, pourcentage_reel: 60, pourcentage_cible: 50, ecart: 10 },
  { categorie: 'États-Unis', valeur: 4000, pourcentage_reel: 40, pourcentage_cible: 50, ecart: -10 },
]

describe('AllocationChartCard', () => {
  it('affiche les barres par défaut, bascule vers le camembert au clic', () => {
    render(<AllocationChartCard title="Répartition géographique" items={ITEMS} onCategoryClick={vi.fn()} />)

    expect(screen.getByTestId('bar-chart')).toBeInTheDocument()
    expect(screen.queryByTestId('pie-chart')).not.toBeInTheDocument()

    fireEvent.click(screen.getByTitle('Camembert (répartition réelle, sans la cible)'))

    expect(screen.getByTestId('pie-chart')).toBeInTheDocument()
    expect(screen.queryByTestId('bar-chart')).not.toBeInTheDocument()
  })

  it("le plein écran affiche un tableau détaillé avec valeurs, écarts et postes extrêmes", () => {
    render(<AllocationChartCard title="Répartition géographique" items={ITEMS} onCategoryClick={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Agrandir le graphique' }))

    // Statistiques complémentaires (absentes de la carte compacte) — "+10.0%"/"-10.0%"
    // apparaissent deux fois (statistique ET ligne du tableau détaillé ci-dessous).
    expect(screen.getByText('Le plus surpondéré')).toBeInTheDocument()
    expect(screen.getAllByText('+10.0%').length).toBeGreaterThan(0)
    expect(screen.getByText('Le plus sous-pondéré')).toBeInTheDocument()
    expect(screen.getAllByText('-10.0%').length).toBeGreaterThan(0)

    // Tableau : une ligne par catégorie, valeur formatée.
    expect(screen.getByText('6 000 €')).toBeInTheDocument()
    expect(screen.getByText('4 000 €')).toBeInTheDocument()
  })

  it('cliquer sur une ligne du tableau en plein écran déclenche onCategoryClick', () => {
    const onCategoryClick = vi.fn()
    render(<AllocationChartCard title="Répartition géographique" items={ITEMS} onCategoryClick={onCategoryClick} />)

    fireEvent.click(screen.getByRole('button', { name: 'Agrandir le graphique' }))
    fireEvent.click(within(screen.getByRole('table')).getByText('Europe'))

    expect(onCategoryClick).toHaveBeenCalledWith('Europe')
  })

  it('sans donnée, affiche un message et masque les contrôles', () => {
    render(<AllocationChartCard title="Répartition géographique" items={[]} onCategoryClick={vi.fn()} />)

    expect(screen.getByText('Aucune donnée')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Agrandir le graphique' })).not.toBeInTheDocument()
  })
})
