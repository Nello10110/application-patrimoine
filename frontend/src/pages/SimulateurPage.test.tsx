import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../api/client'
import type { JonctionPatrimoine, PatrimoineNet, PerformanceSummary } from '../api/types'
import { formatEuro } from '../utils/format'
import { agregerParAnnee, calculerTrajectoire, calculerTrajectoireMensuelle } from '../utils/interetsComposes'
import SimulateurPage from './SimulateurPage'

vi.mock('../api/client', () => ({
  api: {
    getPatrimoineNet: vi.fn(),
    getPerformance: vi.fn(),
    getJonctionPatrimoine: vi.fn(),
    // Objectifs suivis (backlog 2.O.1/2.O.2) : `ObjectifsSuivisSection`, montée en
    // tête de cette page, les appelle au chargement — non testés ici (couverts par
    // `ObjectifsSuivisSection.test.tsx`), résolution neutre.
    listObjectifs: vi.fn(),
    listHoldings: vi.fn(),
    listDetenteurs: vi.fn(),
    getIndicateursSituation: vi.fn(),
  },
}))

// Contrôles transverses (backlog 2.K.3) : `SimulateurPage` lit
// `usePreferencesAffichage()` (montants masqués) — non testé ici, stub neutre.
vi.mock('../hooks/usePreferencesAffichage', () => ({
  usePreferencesAffichage: () => ({ lentille: 'net', setLentille: vi.fn(), montantsMasques: false, toggleMontantsMasques: vi.fn() }),
}))

function patrimoineNet(overrides: Partial<PatrimoineNet> = {}): PatrimoineNet {
  return { actifs_totaux: 10000, passifs_totaux: 0, patrimoine_net: 10000, patrimoine_financier: 10000, repartition_par_classe: [], ...overrides }
}

function performance(overrides: Partial<PerformanceSummary> = {}): PerformanceSummary {
  return {
    valeur_positions: 10000,
    valeur_totale: 10000,
    cout_total_investi: 10000,
    gain_perte_total: 0,
    rendement_simple_pct: 0,
    rendement_annualise_pct: 0,
    dividendes_percus: 0,
    interets_percus: 0,
    autres_revenus: 0,
    frais_payes: 0,
    impots_preleves: 0,
    gains_realises: 0,
    gains_latents: 0,
    nombre_transactions: 0,
    premiere_transaction: null,
    ...overrides,
  }
}

// Mêmes calculs que les helpers privés `libelleAnnee`/`libelleMoisAnnee` de la
// page, pour vérifier le texte affiché sans dupliquer leur implémentation.
function anneeAttendue(offset: number): string {
  return String(new Date().getFullYear() + offset)
}
function moisAnneeAttendu(offset: number): string {
  const maintenant = new Date()
  const totalMois = maintenant.getMonth() + offset
  const annee = maintenant.getFullYear() + Math.floor(totalMois / 12)
  const mois = ((totalMois % 12) + 12) % 12
  const nomMois = new Date(annee, mois, 1).toLocaleDateString('fr-FR', { month: 'long' })
  return `${annee} ${nomMois.charAt(0).toUpperCase()}${nomMois.slice(1)}`
}

// Intl.NumberFormat insère une espace insécable fine entre le nombre et « € » :
// comparée telle quelle par `getByText`, la normalisation de whitespace de
// testing-library sur le texte du DOM la fait diverger d'une chaîne construite
// hors DOM — un motif regex avec `\s` absorbe cette différence dans les deux sens.
function motifEuro(valeur: number, decimales: 0 | 2 = 2): RegExp {
  return new RegExp(formatEuro(valeur, decimales).replace(/\s/g, '\\s'))
}

function jonctionPatrimoine(overrides: Partial<JonctionPatrimoine> = {}): JonctionPatrimoine {
  return {
    taux_epargne_reel_pct: null,
    reste_a_vivre: null,
    versement_mensuel_suggere: null,
    versement_mensuel_epargne_declare: 0,
    categorie_epargne_introuvable: true,
    categorie_logement_introuvable: true,
    ...overrides,
  }
}

describe('SimulateurPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.getPatrimoineNet).mockResolvedValue(patrimoineNet())
    vi.mocked(api.getPerformance).mockResolvedValue(performance())
    vi.mocked(api.getJonctionPatrimoine).mockResolvedValue(jonctionPatrimoine())
    vi.mocked(api.listObjectifs).mockResolvedValue([])
    vi.mocked(api.listHoldings).mockResolvedValue([])
    vi.mocked(api.listDetenteurs).mockResolvedValue([])
    vi.mocked(api.getIndicateursSituation).mockResolvedValue({
      matelas_securite_mois: null,
      taux_endettement_pct: null,
      part_immobilisee_pct: null,
      epargne_disponible: 0,
      depenses_mensuelles_moyennes: null,
      mensualites_totales: 0,
      revenus_nets_mensuels_moyens: null,
    })
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

  it("un échec de chargement du patrimoine net affiche une erreur avec action de reprise (backlog 2.K.5)", async () => {
    vi.mocked(api.getPatrimoineNet).mockRejectedValueOnce(new Error('panne simulée'))
    render(<SimulateurPage />)

    await screen.findByText(/n'a pas pu être préchargé/)
    const bouton = screen.getByRole('button', { name: 'Réessayer' })

    vi.mocked(api.getPatrimoineNet).mockResolvedValueOnce(patrimoineNet({ patrimoine_net: 25000 }))
    fireEvent.click(bouton)

    await waitFor(() => expect(screen.getByLabelText('Capital de départ (€)')).toHaveValue(25000))
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
    it('affiche le tableau annuel par défaut, avec une ligne par année (dont le départ) et les vraies années calendaires', async () => {
      render(<SimulateurPage />)
      await waitFor(() => expect(screen.getByLabelText('Capital de départ (€)')).toHaveValue(10000))

      fireEvent.change(screen.getByLabelText('Versement mensuel (€)'), { target: { value: '100' } })
      fireEvent.click(screen.getByRole('button', { name: '5 ans' }))

      const table = await screen.findByRole('table')
      const lignes = within(table).getAllByRole('row')
      expect(lignes).toHaveLength(1 + (1 + 5)) // en-tête + (départ + 5 années)
      expect(within(table).getByText('Départ')).toBeInTheDocument()

      const annuel = agregerParAnnee(calculerTrajectoireMensuelle(10000, 5, 100, 5))
      const ligneAn3 = within(table).getByText(anneeAttendue(3)).closest('tr')!
      expect(within(ligneAn3).getByText(motifEuro(annuel[3].capital))).toBeInTheDocument()
    })

    it('bascule vers le détail mensuel, avec le mois et l\'année calendaires réels', async () => {
      render(<SimulateurPage />)
      await waitFor(() => expect(screen.getByLabelText('Capital de départ (€)')).toHaveValue(10000))

      fireEvent.click(screen.getByRole('button', { name: '5 ans' }))
      fireEvent.click(screen.getByRole('button', { name: 'Mensuelle' }))

      const table = await screen.findByRole('table')
      const lignes = within(table).getAllByRole('row')
      expect(lignes).toHaveLength(1 + (1 + 5 * 12)) // en-tête + (départ + 60 mois)
      expect(within(table).getByText(moisAnneeAttendu(6))).toBeInTheDocument()
    })
  })

  describe('Intérêts déjà obtenus', () => {
    it('préremplit le champ avec le gain/perte de la rentabilité, plafonné à 0 si négatif', async () => {
      vi.mocked(api.getPerformance).mockResolvedValue(performance({ gain_perte_total: 1500 }))
      render(<SimulateurPage />)

      await waitFor(() => expect(screen.getByLabelText(/Intérêts déjà obtenus/)).toHaveValue(1500))
    })

    it('une moins-value (gain négatif) préremplit le champ à 0, jamais un nombre négatif', async () => {
      vi.mocked(api.getPerformance).mockResolvedValue(performance({ gain_perte_total: -300 }))
      render(<SimulateurPage />)

      await waitFor(() => expect(screen.getByLabelText(/Intérêts déjà obtenus/)).toHaveValue(0))
    })

    it("répartit le capital de départ entre versé et intérêts cumulés dès l'état initial du tableau", async () => {
      vi.mocked(api.getPerformance).mockResolvedValue(performance({ gain_perte_total: 1500 }))
      render(<SimulateurPage />)
      await waitFor(() => expect(screen.getByLabelText(/Intérêts déjà obtenus/)).toHaveValue(1500))

      const table = await screen.findByRole('table')
      const ligneDepart = within(table).getByText('Départ').closest('tr')!
      expect(within(ligneDepart).getByText(motifEuro(8500))).toBeInTheDocument() // 10000 - 1500 versé
      expect(within(ligneDepart).getByText(motifEuro(1500))).toBeInTheDocument() // 1500 d'intérêts déjà cumulés
    })
  })

  describe('Versement mensuel suggéré (backlog 2.N.4)', () => {
    it('préremplit le versement mensuel avec la suggestion issue du budget observé', async () => {
      vi.mocked(api.getJonctionPatrimoine).mockResolvedValue(jonctionPatrimoine({ versement_mensuel_suggere: 350 }))
      render(<SimulateurPage />)

      await waitFor(() => expect(screen.getByLabelText('Versement mensuel (€)')).toHaveValue(350))
    })

    it('ne touche pas au versement (reste à 0) si aucune suggestion disponible', async () => {
      render(<SimulateurPage />)
      await waitFor(() => expect(screen.getByLabelText('Capital de départ (€)')).toHaveValue(10000))

      expect(screen.getByLabelText('Versement mensuel (€)')).toHaveValue(0)
    })

    it('ne préremplit pas avec une suggestion nulle ou négative', async () => {
      vi.mocked(api.getJonctionPatrimoine).mockResolvedValue(jonctionPatrimoine({ versement_mensuel_suggere: -50 }))
      render(<SimulateurPage />)
      await waitFor(() => expect(screen.getByLabelText('Capital de départ (€)')).toHaveValue(10000))

      expect(screen.getByLabelText('Versement mensuel (€)')).toHaveValue(0)
    })

    it('un versement modifié fait apparaître un bouton pour revenir au versement observé', async () => {
      vi.mocked(api.getJonctionPatrimoine).mockResolvedValue(jonctionPatrimoine({ versement_mensuel_suggere: 350 }))
      render(<SimulateurPage />)
      await waitFor(() => expect(screen.getByLabelText('Versement mensuel (€)')).toHaveValue(350))

      fireEvent.change(screen.getByLabelText('Versement mensuel (€)'), { target: { value: '600' } })
      const boutonReset = await screen.findByRole('button', { name: /Revenir au versement observé/ })

      fireEvent.click(boutonReset)
      expect(screen.getByLabelText('Versement mensuel (€)')).toHaveValue(350)
      expect(screen.queryByRole('button', { name: /Revenir au versement observé/ })).not.toBeInTheDocument()
    })

    it("un échec de préchargement du versement observé n'empêche pas d'utiliser le calculateur, avec action de reprise", async () => {
      vi.mocked(api.getJonctionPatrimoine).mockRejectedValueOnce(new Error('panne simulée'))
      render(<SimulateurPage />)

      await screen.findByText(/versement observé sur le budget n'a pas pu être précalculé/)
      expect(screen.getByLabelText('Versement mensuel (€)')).not.toBeDisabled()

      vi.mocked(api.getJonctionPatrimoine).mockResolvedValueOnce(jonctionPatrimoine({ versement_mensuel_suggere: 200 }))
      fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }))

      await waitFor(() => expect(screen.getByLabelText('Versement mensuel (€)')).toHaveValue(200))
    })
  })

  describe('Versement mensuel — addition avec l’Épargne (backlog 2.S.1)', () => {
    it('additionne le versement suggéré par le budget et le versement déclaré sur les comptes Épargne', async () => {
      vi.mocked(api.getJonctionPatrimoine).mockResolvedValue(
        jonctionPatrimoine({ versement_mensuel_suggere: 350, versement_mensuel_epargne_declare: 200 }),
      )
      render(<SimulateurPage />)

      await waitFor(() => expect(screen.getByLabelText('Versement mensuel (€)')).toHaveValue(550))
      expect(screen.getByText(/350 €.*observés sur le budget/)).toBeInTheDocument()
      expect(screen.getByText(/200 €.*déclarés sur l'Épargne/)).toBeInTheDocument()
    })

    it("préremplit avec le seul montant déclaré sur l'Épargne si aucun versement observé sur le budget", async () => {
      vi.mocked(api.getJonctionPatrimoine).mockResolvedValue(
        jonctionPatrimoine({ versement_mensuel_suggere: null, versement_mensuel_epargne_declare: 150 }),
      )
      render(<SimulateurPage />)

      await waitFor(() => expect(screen.getByLabelText('Versement mensuel (€)')).toHaveValue(150))
    })
  })
})
