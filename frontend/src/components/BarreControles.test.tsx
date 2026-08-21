import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { PreferencesAffichageProvider } from '../contexts/PreferencesAffichageContext'
import BarreControles from './BarreControles'

function renderBarre() {
  return render(
    <PreferencesAffichageProvider>
      <BarreControles />
    </PreferencesAffichageProvider>,
  )
}

beforeEach(() => {
  localStorage.clear()
})

describe('BarreControles (backlog 2.K.3)', () => {
  it('affiche les 3 boutons de lentille, "Net" actif par défaut', () => {
    renderBarre()
    expect(screen.getByRole('button', { name: 'Net' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Brut' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Financier' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('cliquer sur "Brut" change la lentille active et persiste le choix', () => {
    renderBarre()
    fireEvent.click(screen.getByRole('button', { name: 'Brut' }))

    expect(screen.getByRole('button', { name: 'Brut' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Net' })).toHaveAttribute('aria-pressed', 'false')
    expect(localStorage.getItem('patrimoine:lentille')).toBe('brut')
  })

  it('le bouton œil bascule le masquage des montants', () => {
    renderBarre()
    const bouton = screen.getByRole('button', { name: /Masquer les montants/ })
    expect(bouton).toHaveAttribute('aria-pressed', 'false')

    fireEvent.click(bouton)

    expect(screen.getByRole('button', { name: /Montants masqués/ })).toHaveAttribute('aria-pressed', 'true')
  })
})
