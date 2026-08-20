import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../api/client'
import type { PatrimoineNet } from '../api/types'
import { formatEuro } from '../utils/format'
import { agregerParAnnee, calculerTrajectoire, calculerTrajectoireMensuelle } from '../utils/interetsComposes'
import SimulateurPage from './SimulateurPage'

vi.mock('../api/client', () => ({
  api: {
    getPatrimoineNet: vi.fn(),
  },
}))

function patrimoineNet(overrides: Partial<PatrimoineNet> = {}): PatrimoineNet {
  return { actifs_totaux: 10000, passifs_totaux: 0, patrimoine_net: 10000, repartition_par_classe: [], ...overrides }
}

// Intl.NumberFormat insère une espace insécable fine entre le nombre et « € » :
// comparée telle quelle par `getByText`, la normalisation de whitespace de
// testing-library sur le texte du DOM la fait diverger d'une chaîne construite
// hors DOM — un motif regex avec `\s` absorbe cette différence dans les deux sens.
function motifEuro(valeur: number, decimales: 0 | 2 = 2): RegExp {
  return new RegExp(formatEuro(valeur, decimales).replace(/\s/g, '\\s'))
}

describe('SimulateurPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.getPatrimoineNet).mockResolvedValue(patrimoineNet())
  })

  it('préremplit le capital de départ avec le patrimoine net actuel', async () => {
    render(<SimulateurPage />)

    await waitFor(() => expect(api.getPatrimoineNet).toHaveBeenCalledTimes(1))
    expect(screen.getByLabelText('Capital de départ (€)')).toHaveValue(10000)
  })

  it('recalcule instantanément la valeur finale au changement de rendement (aucun appel réseau)', async () => {
    render(<SimulateurPage />)
    await waitFor(() => expect(screen.getByLabelText('Capital de départ (€)')).toHaveValue(10000))

    fireEvent.change(screen.getByLabelText('Rendement annuel moyen (%)'), { target: { value: '7' } })

    const attendu = calculerTrajectoire(10000, 7, 0, 20)[20].valeur
    expect(await screen.findByText(motifEuro(attendu, 0))).toBeInTheDocument()
    expect(api.getPatrimoineNet).toHaveBeenCalledTimes(1) // un seul appel réseau pour toute la page
  })

  it("changer l'horizon relance le calcul avec la nouvelle durée", async () => {
    render(<SimulateurPage />)
    await waitFor(() => expect(screen.getByLabelText('Capital de départ (€)')).toHaveValue(10000))

    fireEvent.click(screen.getByRole('button', { name: '10 ans' }))

    const attendu = calculerTrajectoire(10000, 5, 0, 10)[10].valeur
    expect(await screen.findByText(motifEuro(attendu, 0))).toBeInTheDocument()
  })

  it('un capital modifié fait apparaître un bouton pour revenir au patrimoine net actuel', async () => {
    render(<SimulateurPage />)
    await waitFor(() => expect(screen.getByLabelText('Capital de départ (€)')).toHaveValue(10000))

    fireEvent.change(screen.getByLabelText('Capital de départ (€)'), { target: { value: '50000' } })
    const boutonReset = await screen.findByRole('button', { name: /Revenir au patrimoine net actuel/ })

    fireEvent.click(boutonReset)
    expect(screen.getByLabelText('Capital de départ (€)')).toHaveValue(10000)
    expect(screen.queryByRole('button', { name: /Revenir au patrimoine net actuel/ })).not.toBeInTheDocument()
  })

  it("un échec de chargement du patrimoine net n'empêche pas d'utiliser le calculateur", async () => {
    vi.mocked(api.getPatrimoineNet).mockRejectedValue(new Error('panne simulée'))
    render(<SimulateurPage />)

    await waitFor(() => expect(screen.getByLabelText('Capital de départ (€)')).not.toBeDisabled())
    fireEvent.change(screen.getByLabelText('Capital de départ (€)'), { target: { value: '1000' } })
    fireEvent.change(screen.getByLabelText('Rendement annuel moyen (%)'), { target: { value: '0' } })

    // Valeur finale ET Total versé affichent tous deux "1 000 €" ici (capital seul,
    // sans rendement ni versement) : au moins deux correspondances attendues.
    expect((await screen.findAllByText(motifEuro(1000, 0))).length).toBeGreaterThanOrEqual(2)
  })

  describe('FIRE', () => {
    it("n'affiche aucun résultat tant qu'aucune dépense cible n'est saisie", async () => {
      render(<SimulateurPage />)
      await waitFor(() => expect(screen.getByLabelText('Capital de départ (€)')).toHaveValue(10000))

      expect(screen.getByText('Renseigne une dépense annuelle cible pour voir le résultat.')).toBeInTheDocument()
    })

    it('saisir une dépense cible calcule et affiche le résultat FIRE', async () => {
      render(<SimulateurPage />)
      await waitFor(() => expect(screen.getByLabelText('Capital de départ (€)')).toHaveValue(10000))

      fireEvent.change(screen.getByLabelText('Dépense annuelle cible (€)'), { target: { value: '40000' } })

      expect(await screen.findByText(motifEuro(1_000_000, 0))).toBeInTheDocument() // 40000 / 4%
    })

    it('indépendance déjà atteinte affiche "Déjà atteinte"', async () => {
      render(<SimulateurPage />)
      await waitFor(() => expect(screen.getByLabelText('Capital de départ (€)')).toHaveValue(10000))

      fireEvent.change(screen.getByLabelText('Capital de départ (€)'), { target: { value: '2000000' } })
      fireEvent.change(screen.getByLabelText('Dépense annuelle cible (€)'), { target: { value: '40000' } })

      expect(await screen.findByText('Déjà atteinte')).toBeInTheDocument()
    })

    it("indépendance non atteinte dans l'horizon affiche un message explicite", async () => {
      render(<SimulateurPage />)
      await waitFor(() => expect(screen.getByLabelText('Capital de départ (€)')).toHaveValue(10000))

      fireEvent.change(screen.getByLabelText('Capital de départ (€)'), { target: { value: '0' } })
      fireEvent.change(screen.getByLabelText('Rendement annuel moyen (%)'), { target: { value: '0' } })
      fireEvent.change(screen.getByLabelText('Dépense annuelle cible (€)'), { target: { value: '1000000' } })

      expect(await screen.findByText('Non atteinte (60 ans)')).toBeInTheDocument()
    })
  })

  describe('Détail par période', () => {
    it('affiche le tableau annuel par défaut, avec une ligne par année (dont le départ)', async () => {
      render(<SimulateurPage />)
      await waitFor(() => expect(screen.getByLabelText('Capital de départ (€)')).toHaveValue(10000))

      fireEvent.change(screen.getByLabelText('Versement mensuel (€)'), { target: { value: '100' } })
      fireEvent.click(screen.getByRole('button', { name: '5 ans' }))

      const table = await screen.findByRole('table')
      const lignes = within(table).getAllByRole('row')
      expect(lignes).toHaveLength(1 + (1 + 5)) // en-tête + (départ + 5 années)

      const annuel = agregerParAnnee(calculerTrajectoireMensuelle(10000, 5, 100, 5))
      const ligneAn3 = within(table).getByText('An 3').closest('tr')!
      expect(within(ligneAn3).getByText(motifEuro(annuel[3].capital))).toBeInTheDocument()
    })

    it('bascule vers le détail mensuel', async () => {
      render(<SimulateurPage />)
      await waitFor(() => expect(screen.getByLabelText('Capital de départ (€)')).toHaveValue(10000))

      fireEvent.click(screen.getByRole('button', { name: '5 ans' }))
      fireEvent.click(screen.getByRole('button', { name: 'Mensuelle' }))

      const table = await screen.findByRole('table')
      const lignes = within(table).getAllByRole('row')
      expect(lignes).toHaveLength(1 + (1 + 5 * 12)) // en-tête + (départ + 60 mois)
    })
  })
})
