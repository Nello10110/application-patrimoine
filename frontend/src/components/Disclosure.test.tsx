import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import Disclosure from './Disclosure'

describe('Disclosure (backlog 2.K.6)', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('ouvert par défaut (defaultOpen=true) : le contenu est visible', () => {
    render(
      <Disclosure title="Détail">
        <p>Contenu</p>
      </Disclosure>,
    )

    expect(screen.getByText('Contenu')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Détail' })).toHaveAttribute('aria-expanded', 'true')
  })

  it('fermé si defaultOpen=false : le contenu est absent', () => {
    render(
      <Disclosure title="Détail" defaultOpen={false}>
        <p>Contenu</p>
      </Disclosure>,
    )

    expect(screen.queryByText('Contenu')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Détail' })).toHaveAttribute('aria-expanded', 'false')
  })

  it('un clic bascule ouvert/fermé', () => {
    render(
      <Disclosure title="Détail">
        <p>Contenu</p>
      </Disclosure>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Détail' }))
    expect(screen.queryByText('Contenu')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Détail' }))
    expect(screen.getByText('Contenu')).toBeInTheDocument()
  })

  it("l'état persiste dans localStorage et survit à un remontage", () => {
    const { unmount } = render(
      <Disclosure title="Détail">
        <p>Contenu</p>
      </Disclosure>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Détail' }))
    unmount()

    render(
      <Disclosure title="Détail">
        <p>Contenu</p>
      </Disclosure>,
    )

    expect(screen.queryByText('Contenu')).not.toBeInTheDocument()
  })
})
