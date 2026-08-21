import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { usePreferencesAffichage } from '../hooks/usePreferencesAffichage'
import { PreferencesAffichageProvider } from './PreferencesAffichageContext'

function Sonde() {
  const { lentille, setLentille, montantsMasques, toggleMontantsMasques, periode, setPeriode } = usePreferencesAffichage()
  return (
    <div>
      <p>lentille: {lentille}</p>
      <p>montantsMasques: {String(montantsMasques)}</p>
      <p>periode: {periode.type === 'relative' ? periode.valeur : `${periode.dateDebut}..${periode.dateFin}`}</p>
      <button onClick={() => setLentille('brut')}>brut</button>
      <button onClick={toggleMontantsMasques}>toggle</button>
      <button onClick={() => setPeriode({ type: 'relative', valeur: '3M' })}>periode-3M</button>
      <button onClick={() => setPeriode({ type: 'personnalisee', dateDebut: '2026-01-01', dateFin: '2026-06-30' })}>periode-perso</button>
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

describe('PreferencesAffichageProvider — périodes (backlog 2.K.3)', () => {
  it('valeur par défaut : "TOUT"', () => {
    renderSonde()
    expect(screen.getByText('periode: TOUT')).toBeInTheDocument()
  })

  it('persiste une période relative dans localStorage et la relit au remontage', () => {
    const { unmount } = renderSonde()
    fireEvent.click(screen.getByRole('button', { name: 'periode-3M' }))

    expect(screen.getByText('periode: 3M')).toBeInTheDocument()
    expect(localStorage.getItem('patrimoine:periode')).toBe(JSON.stringify({ type: 'relative', valeur: '3M' }))

    unmount()
    renderSonde()
    expect(screen.getByText('periode: 3M')).toBeInTheDocument()
  })

  it('persiste une période personnalisée (objet complet)', () => {
    renderSonde()
    fireEvent.click(screen.getByRole('button', { name: 'periode-perso' }))

    expect(screen.getByText('periode: 2026-01-01..2026-06-30')).toBeInTheDocument()
  })

  it('un contenu localStorage invalide retombe sur la valeur par défaut', () => {
    localStorage.setItem('patrimoine:periode', 'pas-du-json-valide')
    renderSonde()
    expect(screen.getByText('periode: TOUT')).toBeInTheDocument()
  })
})
