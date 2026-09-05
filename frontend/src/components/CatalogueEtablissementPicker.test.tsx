import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import CatalogueEtablissementPicker from './CatalogueEtablissementPicker'

describe('CatalogueEtablissementPicker', () => {
  it('cliquer sur un établissement connu appelle onSelect avec sa clé et son nom canonique', () => {
    const onSelect = vi.fn()
    render(<CatalogueEtablissementPicker selection={null} onSelect={onSelect} />)

    fireEvent.click(screen.getByRole('button', { name: /Trade Republic/ }))

    expect(onSelect).toHaveBeenCalledWith('trade_republic', 'Trade Republic')
  })

  it('« Personnalisé... » appelle onSelect avec une clé nulle', () => {
    const onSelect = vi.fn()
    render(<CatalogueEtablissementPicker selection="trade_republic" onSelect={onSelect} />)

    fireEvent.click(screen.getByRole('button', { name: 'Personnalisé...' }))

    expect(onSelect).toHaveBeenCalledWith(null, '')
  })

  it("l'entrée sélectionnée est visuellement distinguée des autres", () => {
    render(<CatalogueEtablissementPicker selection="boursorama" onSelect={vi.fn()} />)

    const boutonSelectionne = screen.getByRole('button', { name: /Boursorama Banque/ })
    const autreBouton = screen.getByRole('button', { name: /Trade Republic/ })

    expect(boutonSelectionne.className.split(' ')).toContain('border-accent')
    expect(autreBouton.className.split(' ')).not.toContain('border-accent')
  })
})
