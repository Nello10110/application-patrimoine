import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import App from './App'

// Les pages sont chargées à la demande (`React.lazy`, cf. LOT 4.8) et appellent
// toutes l'API au montage : ce fichier ne teste que l'en-tête (navigation, bouton de
// thème), donc chaque page est remplacée par un composant vide.
vi.mock('./pages/DashboardPage', () => ({ default: () => <div /> }))
vi.mock('./pages/PortefeuillePage', () => ({ default: () => <div /> }))
vi.mock('./pages/HoldingDetailPage', () => ({ default: () => <div /> }))
vi.mock('./pages/ObjectifsPage', () => ({ default: () => <div /> }))
vi.mock('./pages/ImportPage', () => ({ default: () => <div /> }))
vi.mock('./pages/ReglagesPage', () => ({ default: () => <div /> }))
vi.mock('./pages/AidePage', () => ({ default: () => <div /> }))

describe('App — bouton de bascule du thème (LOT 5.12)', () => {
  it("affiche un bouton de bascule dans l'en-tête, qui fait cycler le thème au clic", () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    )

    const bouton = screen.getByRole('button', { name: /Thème/ })
    expect(bouton).toBeInTheDocument()
    expect(bouton).toHaveAccessibleName(/Système/)

    fireEvent.click(bouton)
    expect(bouton).toHaveAccessibleName(/Clair/)

    fireEvent.click(bouton)
    expect(bouton).toHaveAccessibleName(/Sombre/)
  })
})
