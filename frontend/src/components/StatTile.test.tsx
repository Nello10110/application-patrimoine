import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import StatTile from './StatTile'

describe('StatTile', () => {
  it('affiche le libellé, la valeur et le sous-titre', () => {
    render(<StatTile label="Valeur totale" value="1 234,50 €" sub="au 07/03/2024" />)

    expect(screen.getByText('Valeur totale')).toBeInTheDocument()
    expect(screen.getByText('1 234,50 €')).toBeInTheDocument()
    expect(screen.getByText('au 07/03/2024')).toBeInTheDocument()
  })

  it("n'affiche pas de sous-titre quand il n'est pas fourni", () => {
    render(<StatTile label="Valeur totale" value="1 234,50 €" />)

    expect(screen.queryByText('au 07/03/2024')).not.toBeInTheDocument()
  })

  it('applique la classe de ton correspondante', () => {
    render(<StatTile label="Rendement" value="+12,3%" tone="good" />)

    expect(screen.getByText('+12,3%')).toHaveClass('text-emerald-600')
  })

  it('utilise le ton neutre par défaut', () => {
    render(<StatTile label="Rendement" value="+12,3%" />)

    expect(screen.getByText('+12,3%')).toHaveClass('text-slate-900')
  })
})
