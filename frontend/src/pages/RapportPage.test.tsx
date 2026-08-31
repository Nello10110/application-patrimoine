import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../api/client'
import type { RapportPeriode } from '../api/types'
import RapportPage from './RapportPage'

vi.mock('../api/client', () => ({
  api: {
    getRapportPeriode: vi.fn(),
  },
}))

// Contrôles transverses (backlog 2.K.3) : `RapportPage` lit
// `usePreferencesAffichage()` (montants masqués, période) — `periode` stub à "Tout"
// (défaut) pour préserver le comportement mode "mensuel" par défaut déjà testé
// ci-dessous ; la synchronisation à sens unique Période→Rapport a son propre test.
vi.mock('../hooks/usePreferencesAffichage', () => ({
  usePreferencesAffichage: () => ({
    lentille: 'net',
    setLentille: vi.fn(),
    montantsMasques: false,
    toggleMontantsMasques: vi.fn(),
    periode: { type: 'relative', valeur: 'TOUT' },
    setPeriode: vi.fn(),
  }),
}))

function rapport(overrides: Partial<RapportPeriode> = {}): RapportPeriode {
  return {
    date_debut: '2026-07-01',
    date_fin: '2026-07-31',
    valeur_debut_periode: 1000,
    valeur_fin_periode: 1100,
    evolution_pct: 10,
    montant_investi_periode: 80,
    gain_genere_periode: 20,
    dividendes_percus: 8.5,
    nombre_transactions: 3,
    plus_gros_mouvements: [{ date: '2026-07-15', type: 'BUY', symbol: 'AAA', nom: 'Titre AAA', montant: -500 }],
    epargne: {
      a_des_donnees: false,
      valeur_debut_periode: 0,
      valeur_fin_periode: 0,
      evolution_pct: null,
      interets_periode: 0,
      versements_periode: 0,
      decomposition_estimee: true,
      repartition_par_type: [],
    },
    ...overrides,
  }
}

describe('RapportPage — mode mensuel (par défaut)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.getRapportPeriode).mockResolvedValue(rapport())
  })

  it('charge le rapport du mois courant au montage et affiche ses indicateurs', async () => {
    render(<RapportPage />)

    await waitFor(() => expect(api.getRapportPeriode).toHaveBeenCalled())
    expect(screen.getByText('+10.0%')).toBeInTheDocument()
    expect(screen.getByText('8,50 €')).toBeInTheDocument()
    expect(screen.getByText(/Titre AAA/)).toBeInTheDocument()
  })

  it("affiche la décomposition investi/généré de l'évolution", async () => {
    render(<RapportPage />)

    await screen.findByText("D'où vient l'évolution ?")
    expect(screen.getByText('80 €')).toBeInTheDocument()
    expect(screen.getByText('20 €')).toBeInTheDocument()
  })

  it("affiche un tiret quand le généré n'est pas calculable (aucun historique)", async () => {
    vi.mocked(api.getRapportPeriode).mockResolvedValue(rapport({ gain_genere_periode: null }))

    render(<RapportPage />)
    await screen.findByText("D'où vient l'évolution ?")

    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('recharge le rapport quand le mois sélectionné change, avec les bornes du mois entier', async () => {
    render(<RapportPage />)
    await waitFor(() => expect(api.getRapportPeriode).toHaveBeenCalledTimes(1))

    const input = screen.getByDisplayValue(/\d{4}-\d{2}/)
    fireEvent.change(input, { target: { value: '2026-03' } })

    await waitFor(() => expect(api.getRapportPeriode).toHaveBeenCalledWith('2026-03-01', '2026-03-31'))
  })

  it('calcule correctement le dernier jour d\'un mois de 30 jours et d\'un mois bissextile', async () => {
    render(<RapportPage />)
    await waitFor(() => expect(api.getRapportPeriode).toHaveBeenCalledTimes(1))

    const input = screen.getByDisplayValue(/\d{4}-\d{2}/)
    fireEvent.change(input, { target: { value: '2026-04' } })
    await waitFor(() => expect(api.getRapportPeriode).toHaveBeenCalledWith('2026-04-01', '2026-04-30'))

    fireEvent.change(input, { target: { value: '2024-02' } }) // 2024 est bissextile
    await waitFor(() => expect(api.getRapportPeriode).toHaveBeenCalledWith('2024-02-01', '2024-02-29'))
  })

  it("affiche un message dédié quand aucune donnée n'existe pour la période", async () => {
    vi.mocked(api.getRapportPeriode).mockResolvedValue(
      rapport({ valeur_debut_periode: null, valeur_fin_periode: null, evolution_pct: null, nombre_transactions: 0, plus_gros_mouvements: [] }),
    )

    render(<RapportPage />)

    await screen.findByText(/Aucune donnée disponible pour cette période/)
  })
})

describe('RapportPage — mode annuel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.getRapportPeriode).mockResolvedValue(rapport())
  })

  it("bascule vers l'annuel et interroge du 1er janvier au 31 décembre de l'année courante", async () => {
    render(<RapportPage />)
    await waitFor(() => expect(api.getRapportPeriode).toHaveBeenCalledTimes(1))

    fireEvent.click(screen.getByRole('button', { name: 'Annuel' }))

    const anneeCourante = new Date().getFullYear()
    await waitFor(() => expect(api.getRapportPeriode).toHaveBeenCalledWith(`${anneeCourante}-01-01`, `${anneeCourante}-12-31`))
  })

  it("change d'année recharge le rapport avec les nouvelles bornes", async () => {
    render(<RapportPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Annuel' }))
    await waitFor(() => expect(api.getRapportPeriode).toHaveBeenCalledTimes(2))

    const inputAnnee = screen.getByDisplayValue(String(new Date().getFullYear()))
    fireEvent.change(inputAnnee, { target: { value: '2023' } })

    await waitFor(() => expect(api.getRapportPeriode).toHaveBeenCalledWith('2023-01-01', '2023-12-31'))
  })
})

describe('RapportPage — mode personnalisé', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.getRapportPeriode).mockResolvedValue(rapport())
  })

  it('interroge la période choisie via les deux sélecteurs de date', async () => {
    render(<RapportPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Personnalisé' }))
    await waitFor(() => expect(api.getRapportPeriode).toHaveBeenCalledTimes(2))

    const [inputDebut, inputFin] = screen.getAllByDisplayValue(/^\d{4}-\d{2}-\d{2}$/)
    fireEvent.change(inputDebut, { target: { value: '2026-02-10' } })
    fireEvent.change(inputFin, { target: { value: '2026-05-20' } })

    await waitFor(() => expect(api.getRapportPeriode).toHaveBeenCalledWith('2026-02-10', '2026-05-20'))
  })

  it('affiche une erreur et bloque la requête si la date de fin précède la date de début', async () => {
    render(<RapportPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Personnalisé' }))
    await waitFor(() => expect(api.getRapportPeriode).toHaveBeenCalledTimes(2))
    vi.mocked(api.getRapportPeriode).mockClear()

    const [inputDebut, inputFin] = screen.getAllByDisplayValue(/^\d{4}-\d{2}-\d{2}$/)
    fireEvent.change(inputDebut, { target: { value: '2026-06-01' } })
    await waitFor(() => expect(api.getRapportPeriode).toHaveBeenCalled()) // borne de fin encore valide à ce stade
    vi.mocked(api.getRapportPeriode).mockClear()

    fireEvent.change(inputFin, { target: { value: '2026-01-01' } })

    await screen.findByText(/La date de fin doit être postérieure ou égale à la date de début/)
    expect(api.getRapportPeriode).not.toHaveBeenCalled()
  })
})

describe("RapportPage — bloc épargne (backlog § U.1)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("masque entièrement le bloc épargne quand le foyer n'a aucune ligne d'épargne", async () => {
    vi.mocked(api.getRapportPeriode).mockResolvedValue(rapport())
    render(<RapportPage />)

    await waitFor(() => expect(api.getRapportPeriode).toHaveBeenCalled())
    expect(screen.queryByText('Épargne en fin de période')).not.toBeInTheDocument()
  })

  it('affiche les tuiles épargne quand le foyer a des lignes valorisées', async () => {
    vi.mocked(api.getRapportPeriode).mockResolvedValue(
      rapport({
        epargne: {
          a_des_donnees: true,
          valeur_debut_periode: 10000,
          valeur_fin_periode: 10500,
          evolution_pct: 5,
          interets_periode: 200,
          versements_periode: 300,
          decomposition_estimee: true,
          repartition_par_type: [
            { label: 'Assurance-vie', valeur: 8000 },
            { label: 'Épargne réglementée', valeur: 2500 },
          ],
        },
      }),
    )
    render(<RapportPage />)

    await screen.findByText('Épargne en fin de période')
    expect(screen.getByText('10 500 €')).toBeInTheDocument()
    expect(screen.getByText('+5.0%')).toBeInTheDocument()
    expect(screen.getByText("D'où vient l'évolution de l'épargne ? (estimation)")).toBeInTheDocument()
    expect(screen.getByText('300 €')).toBeInTheDocument()
    expect(screen.getByText('200 €')).toBeInTheDocument()
    expect(screen.getByText('Répartition de l\'épargne par type')).toBeInTheDocument()
    expect(document.querySelector('.recharts-responsive-container')).toBeInTheDocument()
  })

  it("affiche les libellés « déclarés » plutôt qu'« estimés » quand un versement a été précisé (backlog § U.2)", async () => {
    vi.mocked(api.getRapportPeriode).mockResolvedValue(
      rapport({
        epargne: {
          a_des_donnees: true,
          valeur_debut_periode: 10000,
          valeur_fin_periode: 10500,
          evolution_pct: 5,
          interets_periode: 200,
          versements_periode: 300,
          decomposition_estimee: false,
          repartition_par_type: [{ label: 'Assurance-vie', valeur: 10500 }],
        },
      }),
    )
    render(<RapportPage />)

    await screen.findByText("D'où vient l'évolution de l'épargne ?")
    expect(screen.queryByText("D'où vient l'évolution de l'épargne ? (estimation)")).not.toBeInTheDocument()
    expect(screen.getByText('Versements déclarés')).toBeInTheDocument()
    expect(screen.getByText('Intérêts (résidu)')).toBeInTheDocument()
  })
})
