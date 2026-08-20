import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { formatEuro } from '../utils/format'
import { agregerParAnnee, calculerTrajectoire, calculerTrajectoireMensuelle } from '../utils/interetsComposes'
import OutilsPage from './OutilsPage'

// Intl.NumberFormat insère une espace insécable fine entre le nombre et « € » :
// comparée telle quelle par `getByText`, la normalisation de whitespace de
// testing-library sur le texte du DOM la fait diverger d'une chaîne construite
// hors DOM — un motif regex avec `\s` absorbe cette différence dans les deux sens.
function motifEuro(valeur: number, decimales: 0 | 2 = 2): RegExp {
  return new RegExp(formatEuro(valeur, decimales).replace(/\s/g, '\\s'))
}

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
    expect(screen.getByText(motifEuro(valeurAttendue, 0))).toBeInTheDocument()
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

  it('affiche le tableau annuel par défaut, avec une ligne par année (dont le départ)', () => {
    render(<OutilsPage />)

    fireEvent.change(screen.getByLabelText(/Capital de départ/), { target: { value: '1000' } })
    fireEvent.change(screen.getByLabelText(/Taux annuel moyen/), { target: { value: '5' } })
    fireEvent.change(screen.getByLabelText(/Versement mensuel/), { target: { value: '100' } })
    fireEvent.click(screen.getByRole('button', { name: '5 ans' }))

    const table = screen.getByRole('table')
    const lignes = within(table).getAllByRole('row')
    expect(lignes).toHaveLength(1 + (1 + 5)) // en-tête + (départ + 5 années)
    expect(within(table).getByText('Départ')).toBeInTheDocument()
    expect(within(table).getByText('An 3')).toBeInTheDocument()

    const annuel = agregerParAnnee(calculerTrajectoireMensuelle(1000, 5, 100, 5))
    const ligneAn3 = within(table).getByText('An 3').closest('tr')!
    expect(within(ligneAn3).getByText(motifEuro(annuel[3].versements))).toBeInTheDocument()
    expect(within(ligneAn3).getByText(motifEuro(annuel[3].capital))).toBeInTheDocument()
  })

  it('bascule vers le détail mensuel, avec 12 lignes par année', () => {
    render(<OutilsPage />)

    fireEvent.change(screen.getByLabelText(/Capital de départ/), { target: { value: '1000' } })
    fireEvent.change(screen.getByLabelText(/Taux annuel moyen/), { target: { value: '5' } })
    fireEvent.change(screen.getByLabelText(/Versement mensuel/), { target: { value: '100' } })
    fireEvent.click(screen.getByRole('button', { name: '5 ans' }))

    fireEvent.click(screen.getByRole('button', { name: 'Mensuelle' }))

    const table = screen.getByRole('table')
    const lignes = within(table).getAllByRole('row')
    expect(lignes).toHaveLength(1 + (1 + 5 * 12)) // en-tête + (départ + 60 mois)
    expect(within(table).getByText('An 2 · mois 6')).toBeInTheDocument()

    const mensuel = calculerTrajectoireMensuelle(1000, 5, 100, 5)
    const ligneMois = mensuel.find((p) => p.annee === 2 && p.moisDeLAnnee === 6)!
    const ligneDom = within(table).getByText('An 2 · mois 6').closest('tr')!
    expect(within(ligneDom).getByText(motifEuro(ligneMois.interets))).toBeInTheDocument()
  })
})
