import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { CoutGestionConsolide } from '../api/types'
import CoutGestionCard from './CoutGestionCard'

function makeCout(overrides: Partial<CoutGestionConsolide> = {}): CoutGestionConsolide {
  return {
    valeur_fonds: 1000,
    valeur_fonds_avec_ter_connu: 1000,
    couverture_pct: 100,
    cout_annuel_estime: 2,
    ...overrides,
  }
}

describe('CoutGestionCard', () => {
  it("n'affiche rien sans aucun fonds détenu", () => {
    const { container } = render(<CoutGestionCard cout={makeCout({ valeur_fonds: 0 })} />)

    expect(container).toBeEmptyDOMElement()
  })

  it('affiche le coût annuel estimé et la couverture', () => {
    render(<CoutGestionCard cout={makeCout()} />)

    expect(screen.getByText('2,00 €')).toBeInTheDocument()
    expect(screen.getByText(/1 000 €/)).toBeInTheDocument()
    expect(screen.getByText(/100% avec des frais de gestion connus/)).toBeInTheDocument()
  })

  it('signale la sous-estimation quand la couverture est partielle', () => {
    render(<CoutGestionCard cout={makeCout({ valeur_fonds: 1000, valeur_fonds_avec_ter_connu: 600, couverture_pct: 60 })} />)

    expect(screen.getByText(/le coût réel est donc sous-estimé/)).toBeInTheDocument()
  })
})
