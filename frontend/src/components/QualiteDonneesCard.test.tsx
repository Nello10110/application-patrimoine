import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { QualiteDonnees } from '../api/types'
import QualiteDonneesCard from './QualiteDonneesCard'

// Contrôles transverses (backlog 2.K.3) : `QualiteDonneesCard` lit
// `usePreferencesAffichage()` (montants masqués) — non testé ici, stub neutre.
vi.mock('../hooks/usePreferencesAffichage', () => ({
  usePreferencesAffichage: () => ({ lentille: 'net', setLentille: vi.fn(), montantsMasques: false, toggleMontantsMasques: vi.fn() }),
}))

function makeQualite(overrides: Partial<QualiteDonnees> = {}): QualiteDonnees {
  return {
    valeur_composition_reelle: 1000,
    pct_composition_reelle: 100,
    valeur_estimee_par_indice: 0,
    pct_estimee_par_indice: 0,
    valeur_non_categorisee: 0,
    pct_non_categorisee: 0,
    valeur_sans_cotation: 0,
    pct_sans_cotation: 0,
    ...overrides,
  }
}

describe('QualiteDonneesCard', () => {
  it("n'affiche rien quand tout le portefeuille a une composition réelle cotée", () => {
    const { container } = render(<QualiteDonneesCard qualite={makeQualite()} />)

    expect(container).toBeEmptyDOMElement()
  })

  it("signale l'estimation par indice", () => {
    render(
      <QualiteDonneesCard
        qualite={makeQualite({ pct_estimee_par_indice: 42, valeur_estimee_par_indice: 4200 })}
      />,
    )

    expect(screen.getByText(/42% de la valeur du portefeuille/)).toBeInTheDocument()
    expect(screen.getByText(/estimée à partir de l'indice suivi par le fonds/)).toBeInTheDocument()
  })

  it('signale les lignes non catégorisées', () => {
    render(
      <QualiteDonneesCard
        qualite={makeQualite({ pct_non_categorisee: 15, valeur_non_categorisee: 1500 })}
      />,
    )

    expect(screen.getByText(/n'a aucune donnée géographique disponible/)).toBeInTheDocument()
  })

  it('signale la valorisation au coût de revient faute de cotation', () => {
    render(
      <QualiteDonneesCard
        qualite={makeQualite({ pct_sans_cotation: 10, valeur_sans_cotation: 1000 })}
      />,
    )

    expect(screen.getByText(/valorisés à leur coût de revient faute de cotation disponible/)).toBeInTheDocument()
  })
})
