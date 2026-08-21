import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import EtatErreur from './EtatErreur'

describe('EtatErreur (backlog 2.K.5)', () => {
  it("affiche le message sans bouton quand onReessayer n'est pas fourni", () => {
    render(<EtatErreur message="Panne réseau simulée" />)

    expect(screen.getByText('Panne réseau simulée')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Réessayer' })).not.toBeInTheDocument()
  })

  it('affiche un bouton Réessayer et l’appelle au clic quand onReessayer est fourni', () => {
    const onReessayer = vi.fn()
    render(<EtatErreur message="Panne réseau simulée" onReessayer={onReessayer} />)

    const bouton = screen.getByRole('button', { name: 'Réessayer' })
    fireEvent.click(bouton)

    expect(onReessayer).toHaveBeenCalledTimes(1)
  })

  it('accepte un message ReactNode (pas seulement une chaîne)', () => {
    render(
      <EtatErreur
        message={
          <>
            Erreur composée <span>avec un élément enfant</span>
          </>
        }
      />,
    )

    expect(screen.getByText('Erreur composée', { exact: false })).toBeInTheDocument()
    expect(screen.getByText('avec un élément enfant')).toBeInTheDocument()
  })
})
