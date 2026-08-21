import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../api/client'
import type { Detenteur } from '../api/types'
import { PreferencesAffichageProvider } from '../contexts/PreferencesAffichageContext'
import BarreControles from './BarreControles'

// Détenteurs (backlog 2.L.1) : `BarreControles` charge la liste au montage pour son
// sélecteur "Détenteur", masqué tant qu'aucun n'est déclaré.
vi.mock('../api/client', () => ({
  api: {
    listDetenteurs: vi.fn().mockResolvedValue([]),
  },
}))

function detenteur(overrides: Partial<Detenteur> = {}): Detenteur {
  return { id: 1, nom: 'Alice', type: 'personne', created_at: '2026-01-01T00:00:00', updated_at: '2026-01-01T00:00:00', ...overrides }
}

function renderBarre() {
  return render(
    <PreferencesAffichageProvider>
      <BarreControles />
    </PreferencesAffichageProvider>,
  )
}

beforeEach(() => {
  localStorage.clear()
  vi.mocked(api.listDetenteurs).mockResolvedValue([])
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

describe('BarreControles — filtre détenteur (backlog 2.L.1)', () => {
  it("n'affiche aucun sélecteur Détenteur si l'utilisateur n'a déclaré personne", async () => {
    renderBarre()
    await vi.waitFor(() => expect(api.listDetenteurs).toHaveBeenCalled())
    expect(screen.queryByText('Détenteur')).not.toBeInTheDocument()
  })

  it('affiche "Foyer" + chaque détenteur déclaré, "Foyer" sélectionné par défaut', async () => {
    vi.mocked(api.listDetenteurs).mockResolvedValue([detenteur({ nom: 'Alice' }), detenteur({ id: 2, nom: 'Bob' })])
    renderBarre()

    await screen.findByText('Détenteur')
    const select = screen.getAllByRole('combobox')[0]
    expect(select).toHaveValue('')
    expect(screen.getByRole('option', { name: 'Foyer' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Alice' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Bob' })).toBeInTheDocument()
  })

  it('choisir un détenteur persiste son id dans localStorage', async () => {
    vi.mocked(api.listDetenteurs).mockResolvedValue([detenteur({ id: 7, nom: 'Alice' })])
    renderBarre()
    await screen.findByText('Détenteur')

    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: '7' } })

    expect(localStorage.getItem('patrimoine:detenteur-id')).toBe('7')
  })
})

describe('BarreControles — Période (backlog 2.K.3)', () => {
  it('"Tout" est la valeur par défaut', () => {
    renderBarre()
    const selects = screen.getAllByRole('combobox')
    const selectPeriode = selects[selects.length - 1]
    expect(selectPeriode).toHaveValue('TOUT')
  })

  it('choisir "3 mois" persiste la préférence', () => {
    renderBarre()
    const selects = screen.getAllByRole('combobox')
    const selectPeriode = selects[selects.length - 1]

    fireEvent.change(selectPeriode, { target: { value: '3M' } })

    expect(localStorage.getItem('patrimoine:periode')).toBe(JSON.stringify({ type: 'relative', valeur: '3M' }))
  })

  it('choisir "Personnalisée" affiche deux champs de date', () => {
    renderBarre()
    const selects = screen.getAllByRole('combobox')
    const selectPeriode = selects[selects.length - 1]

    fireEvent.change(selectPeriode, { target: { value: 'personnalisee' } })

    const champsDate = document.querySelectorAll('input[type="date"]')
    expect(champsDate).toHaveLength(2)
  })
})
