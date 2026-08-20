import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { formatEuro } from '../utils/format'
import { calculerTrajectoire } from '../utils/interetsComposes'
import OutilsPage from './OutilsPage'

describe('OutilsPage — calculateur d\'intérêts composés (UI)', () => {
  it('capital seul, taux nul : valeur finale = total versé = capital, aucun gain', () => {
    render(<OutilsPage />)

    fireEvent.change(screen.getByLabelText(/Capital de départ/), { target: { value: '1000' } })
    fireEvent.change(screen.getByLabelText(/Taux annuel moyen/), { target: { value: '0' } })
    fireEvent.change(screen.getByLabelText(/Versement mensuel/), { target: { value: '0' } })

    const tuiles = screen.getAllByText('1 000 €')
    expect(tuiles.length).toBeGreaterThanOrEqual(2) // Valeur finale ET Total versé
    expect(screen.getByText('0 €')).toBeInTheDocument() // Intérêts gagnés
  })

  it('affiche la valeur finale capitalisée sur 5 ans à 12%/an', () => {
    render(<OutilsPage />)

    fireEvent.change(screen.getByLabelText(/Capital de départ/), { target: { value: '1000' } })
    fireEvent.change(screen.getByLabelText(/Taux annuel moyen/), { target: { value: '12' } })
    fireEvent.change(screen.getByLabelText(/Versement mensuel/), { target: { value: '0' } })
    fireEvent.click(screen.getByRole('button', { name: '5 ans' }))

    const valeurAttendue = calculerTrajectoire(1000, 12, 0, 5)[5].valeur
    // Intl.NumberFormat insère une espace insécable fine entre le nombre et « € » :
    // comparée telle quelle par `getByText`, la normalisation de whitespace de
    // testing-library sur le texte du DOM la fait diverger de la chaîne construite
    // ici — un motif regex avec `\s` absorbe cette différence dans les deux sens.
    const motif = new RegExp(formatEuro(valeurAttendue, 0).replace(/\s/g, '\\s'))
    expect(screen.getByText(motif)).toBeInTheDocument()
  })

  it('affiche une erreur si un champ est vide', () => {
    render(<OutilsPage />)

    fireEvent.change(screen.getByLabelText(/Capital de départ/), { target: { value: '' } })

    expect(screen.getByText(/Renseigne des valeurs numériques positives/)).toBeInTheDocument()
  })

  it('change de durée au clic sur les boutons', () => {
    render(<OutilsPage />)

    const bouton10ans = screen.getByRole('button', { name: '10 ans' })
    fireEvent.click(bouton10ans)

    expect(bouton10ans.className).toMatch(/bg-slate-900/)
  })
})
