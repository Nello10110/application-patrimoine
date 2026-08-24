import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../api/client'
import type { PartagePayload } from '../api/types'
import PartagePublicPage from './PartagePublicPage'

// Page PUBLIQUE (backlog 2.Q.1), montée hors de tout contexte d'authentification —
// ce fichier ne fournit donc ni `AuthProvider` ni `PreferencesAffichageProvider`,
// pour verrouiller que la page ne dépend d'aucun des deux.
vi.mock('../api/client', () => ({
  api: {
    getPartageMeta: vi.fn(),
    consulterPartage: vi.fn(),
  },
}))

function renderPage(token = 'abc123') {
  return render(
    <MemoryRouter initialEntries={[`/partage/${token}`]}>
      <Routes>
        <Route path="/partage/:token" element={<PartagePublicPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

function payload(overrides: Partial<PartagePayload> = {}): PartagePayload {
  return {
    nom_lien: 'Pour la banque',
    masque: false,
    detenteur_id: null,
    patrimoine_net: {
      patrimoine_net: 180000,
      actifs_totaux: 300000,
      passifs_totaux: 120000,
      repartition_par_classe: [{ categorie: 'Immobilier', valeur: 300000, pourcentage: 100 }],
    },
    exposition: null,
    performance: null,
    budget: null,
    objectifs: null,
    ...overrides,
  }
}

describe('PartagePublicPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('affiche directement les données quand aucun code n’est requis', async () => {
    vi.mocked(api.getPartageMeta).mockResolvedValue({ nom_lien: 'Pour la banque', code_requis: false })
    vi.mocked(api.consulterPartage).mockResolvedValue(payload())

    renderPage()

    await screen.findByText('180 000 €')
    expect(screen.getAllByText('Patrimoine net').length).toBeGreaterThan(0)
    expect(api.consulterPartage).toHaveBeenCalledWith('abc123', null)
  })

  it('affiche un champ code quand le lien en exige un, et ne consulte qu’après soumission', async () => {
    vi.mocked(api.getPartageMeta).mockResolvedValue({ nom_lien: 'Pour la banque', code_requis: true })
    vi.mocked(api.consulterPartage).mockResolvedValue(payload())

    renderPage()

    await screen.findByText("Code d'accès requis")
    expect(api.consulterPartage).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText('Code'), { target: { value: '1234' } })
    fireEvent.click(screen.getByRole('button', { name: 'Accéder' }))

    await screen.findByText('180 000 €')
    expect(api.consulterPartage).toHaveBeenCalledWith('abc123', '1234')
  })

  it('affiche un message d’erreur si le code est incorrect, sans quitter le formulaire', async () => {
    vi.mocked(api.getPartageMeta).mockResolvedValue({ nom_lien: 'Pour la banque', code_requis: true })
    vi.mocked(api.consulterPartage).mockRejectedValue(new Error('Code incorrect.'))

    renderPage()
    await screen.findByText("Code d'accès requis")

    fireEvent.change(screen.getByLabelText('Code'), { target: { value: '0000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Accéder' }))

    await screen.findByText('Code incorrect.')
    expect(screen.getByLabelText('Code')).toBeInTheDocument()
  })

  it('affiche un message si le lien est introuvable/expiré/révoqué', async () => {
    vi.mocked(api.getPartageMeta).mockRejectedValue(new Error('Ce lien de partage est introuvable, expiré, ou a été révoqué.'))

    renderPage()

    await screen.findByText('Ce lien de partage est introuvable, expiré, ou a été révoqué.')
  })

  it('masque les sections non incluses dans la réponse', async () => {
    vi.mocked(api.getPartageMeta).mockResolvedValue({ nom_lien: 'Pour la banque', code_requis: false })
    vi.mocked(api.consulterPartage).mockResolvedValue(payload({ patrimoine_net: null, exposition: null }))

    renderPage()

    await screen.findByText('Vue en lecture seule, générée par Application Patrimoine.')
    expect(screen.queryByText('Patrimoine net')).not.toBeInTheDocument()
  })

  it('affiche les montants masqués comme des pourcentages seuls', async () => {
    vi.mocked(api.getPartageMeta).mockResolvedValue({ nom_lien: 'Pour la banque', code_requis: false })
    vi.mocked(api.consulterPartage).mockResolvedValue(
      payload({
        masque: true,
        patrimoine_net: {
          patrimoine_net: null,
          actifs_totaux: null,
          passifs_totaux: null,
          repartition_par_classe: [{ categorie: 'Immobilier', valeur: null, pourcentage: 100 }],
        },
      }),
    )

    renderPage()

    await screen.findByText('Immobilier')
    expect(screen.getByText('100%')).toBeInTheDocument()
    expect(screen.queryByText('180 000 €')).not.toBeInTheDocument()
  })
})
