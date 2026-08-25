import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../api/client'
import type { Preferences, SalaireResume } from '../api/types'
import SalairePage from './SalairePage'

vi.mock('../api/client', () => ({
  api: {
    getSalaires: vi.fn(),
    getPreferences: vi.fn(),
    updateSalaire: vi.fn(),
  },
}))

vi.mock('../hooks/usePreferencesAffichage', () => ({
  usePreferencesAffichage: () => ({ montantsMasques: false }),
}))

const ANNEE = new Date().getFullYear()

function preferences(overrides: Partial<Preferences> = {}): Preferences {
  return { methode_cout: 'cout_moyen_pondere', seuil_alerte_ecart_pct: 5, taux_imposition_pct: null, ...overrides }
}

function resume(overrides: Partial<SalaireResume> = {}): SalaireResume {
  return {
    annee: ANNEE,
    montant: 3000,
    type_montant: 'brut',
    periodicite: 'mensuel',
    statut: 'cadre',
    nombre_mois: 12,
    brut_annuel: 36000,
    brut_mensuel_moyen: 3000,
    brut_par_versement: 3000,
    net_avant_impot_annuel: 27000,
    net_avant_impot_mensuel_moyen: 2250,
    net_avant_impot_par_versement: 2250,
    net_apres_impot_annuel: null,
    net_apres_impot_mensuel_moyen: null,
    montant_investi_annee: 2700,
    taux_epargne_pct: 10,
    taux_epargne_base_net_apres_impot: false,
    ...overrides,
  }
}

function renderPage() {
  return render(
    <MemoryRouter>
      <SalairePage />
    </MemoryRouter>,
  )
}

describe('SalairePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("affiche un état vide quand aucun salaire n'est encore enregistré", async () => {
    vi.mocked(api.getSalaires).mockResolvedValue([])
    vi.mocked(api.getPreferences).mockResolvedValue(preferences())

    renderPage()

    await screen.findByText(/Aucun salaire enregistré pour l'instant/)
  })

  it('affiche une erreur avec un bouton Réessayer si le chargement échoue', async () => {
    vi.mocked(api.getSalaires).mockRejectedValue(new Error('Panne réseau'))
    vi.mocked(api.getPreferences).mockResolvedValue(preferences())

    renderPage()

    await screen.findByText('Panne réseau')
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeInTheDocument()
  })

  it("met à jour l'aperçu en direct pendant la saisie sans appeler l'API", async () => {
    vi.mocked(api.getSalaires).mockResolvedValue([])
    vi.mocked(api.getPreferences).mockResolvedValue(preferences())

    renderPage()
    await screen.findByPlaceholderText('ex. 2500')

    fireEvent.change(screen.getByPlaceholderText('ex. 2500'), { target: { value: '3000' } })

    await screen.findByText(/36\s000/)
    expect(api.updateSalaire).not.toHaveBeenCalled()
  })

  it("enregistre puis affiche le résultat renvoyé par le serveur", async () => {
    vi.mocked(api.getSalaires).mockResolvedValue([])
    vi.mocked(api.getPreferences).mockResolvedValue(preferences())
    vi.mocked(api.updateSalaire).mockResolvedValue(resume())

    renderPage()
    await screen.findByPlaceholderText('ex. 2500')

    fireEvent.change(screen.getByPlaceholderText('ex. 2500'), { target: { value: '3000' } })
    fireEvent.click(screen.getByRole('button', { name: `Enregistrer pour ${ANNEE}` }))

    await waitFor(() =>
      expect(api.updateSalaire).toHaveBeenCalledWith(ANNEE, {
        montant: 3000,
        type_montant: 'brut',
        periodicite: 'mensuel',
        statut: 'cadre',
        nombre_mois: 12,
      }),
    )
    await screen.findByText(`Détail enregistré — ${ANNEE}`)
    expect(screen.getAllByText('10.0 %').length).toBeGreaterThan(0)
  })

  it("invite à renseigner le taux d'imposition quand il n'est pas défini", async () => {
    vi.mocked(api.getSalaires).mockResolvedValue([])
    vi.mocked(api.getPreferences).mockResolvedValue(preferences({ taux_imposition_pct: null }))

    renderPage()

    await screen.findByText(/Renseigne ton taux d'imposition/)
  })

  it("n'invite pas à renseigner le taux d'imposition quand il est déjà défini", async () => {
    vi.mocked(api.getSalaires).mockResolvedValue([])
    vi.mocked(api.getPreferences).mockResolvedValue(preferences({ taux_imposition_pct: 12 }))

    renderPage()
    await screen.findByText(/Aucun salaire enregistré pour l'instant/)

    expect(screen.queryByText(/Renseigne ton taux d'imposition/)).not.toBeInTheDocument()
  })

  it("affiche l'historique du taux d'épargne sur plusieurs années et sa moyenne", async () => {
    vi.mocked(api.getSalaires).mockResolvedValue([resume({ annee: ANNEE, taux_epargne_pct: 10 }), resume({ annee: ANNEE - 1, taux_epargne_pct: 20 })])
    vi.mocked(api.getPreferences).mockResolvedValue(preferences())

    renderPage()

    await screen.findByText('15.0 %') // moyenne (10+20)/2
    expect(screen.getByRole('cell', { name: String(ANNEE - 1) })).toBeInTheDocument()
  })
})
