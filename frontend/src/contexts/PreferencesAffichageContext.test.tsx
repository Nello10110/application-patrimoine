import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { usePreferencesAffichage } from '../hooks/usePreferencesAffichage'
import { PreferencesAffichageProvider } from './PreferencesAffichageContext'

function Sonde() {
  const { lentille, setLentille, montantsMasques, toggleMontantsMasques } = usePreferencesAffichage()
  return (
    <div>
      <p>lentille: {lentille}</p>
      <p>montantsMasques: {String(montantsMasques)}</p>
      <button onClick={() => setLentille('brut')}>brut</button>
      <button onClick={toggleMontantsMasques}>toggle</button>
    </div>
  )
}

function renderSonde() {
  return render(
    <PreferencesAffichageProvider>
      <Sonde />
    </PreferencesAffichageProvider>,
  )
}

beforeEach(() => {
  localStorage.clear()
})

describe('PreferencesAffichageProvider (backlog 2.K.3)', () => {
  it('valeurs par défaut : lentille "net", montants visibles', () => {
    renderSonde()
    expect(screen.getByText('lentille: net')).toBeInTheDocument()
    expect(screen.getByText('montantsMasques: false')).toBeInTheDocument()
  })

  it('persiste la lentille dans localStorage et la relit au remontage', () => {
    const { unmount } = renderSonde()
    fireEvent.click(screen.getByRole('button', { name: 'brut' }))

    expect(screen.getByText('lentille: brut')).toBeInTheDocument()
    expect(localStorage.getItem('patrimoine:lentille')).toBe('brut')

    unmount()
    renderSonde()
    expect(screen.getByText('lentille: brut')).toBeInTheDocument()
  })

  it('persiste le masquage des montants dans localStorage et le relit au remontage', () => {
    const { unmount } = renderSonde()
    fireEvent.click(screen.getByRole('button', { name: 'toggle' }))

    expect(screen.getByText('montantsMasques: true')).toBeInTheDocument()
    expect(localStorage.getItem('patrimoine:montants-masques')).toBe('1')

    unmount()
    renderSonde()
    expect(screen.getByText('montantsMasques: true')).toBeInTheDocument()
  })

  it('Ctrl+Maj+M bascule le masquage des montants', () => {
    renderSonde()
    fireEvent.keyDown(document, { key: 'M', ctrlKey: true, shiftKey: true })
    expect(screen.getByText('montantsMasques: true')).toBeInTheDocument()
  })

  it('⌘+Maj+M (Mac) bascule aussi le masquage des montants', () => {
    renderSonde()
    fireEvent.keyDown(document, { key: 'M', metaKey: true, shiftKey: true })
    expect(screen.getByText('montantsMasques: true')).toBeInTheDocument()
  })

  it('le raccourci est ignoré si le focus est sur un champ de saisie', () => {
    render(
      <PreferencesAffichageProvider>
        <input aria-label="champ" />
        <Sonde />
      </PreferencesAffichageProvider>,
    )
    screen.getByLabelText('champ').focus()

    fireEvent.keyDown(document, { key: 'M', ctrlKey: true, shiftKey: true })

    expect(screen.getByText('montantsMasques: false')).toBeInTheDocument()
  })

  it('Ctrl+M seul (sans Maj) ne déclenche rien', () => {
    renderSonde()
    fireEvent.keyDown(document, { key: 'M', ctrlKey: true })
    expect(screen.getByText('montantsMasques: false')).toBeInTheDocument()
  })
})
