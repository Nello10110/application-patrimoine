import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import InfoBulle from './InfoBulle'

describe('InfoBulle', () => {
  it("affiche le texte d'aide via l'attribut title", () => {
    render(<InfoBulle texte="Explication du champ" />)

    expect(screen.getByTitle('Explication du champ')).toBeInTheDocument()
  })

  it("reste invisible pour le nom accessible du label englobant (aria-hidden)", () => {
    render(
      <label>
        <span>
          Mon champ
          <InfoBulle texte="Explication du champ" />
        </span>
        <input aria-label="Mon champ" />
      </label>,
    )

    expect(screen.getByLabelText('Mon champ')).toBeInTheDocument()
  })
})
