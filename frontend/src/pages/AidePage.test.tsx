import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../api/client'
import AidePage from './AidePage'

vi.mock('../api/client', () => ({
  api: {
    getZonesGeographiques: vi.fn(),
  },
}))

const ZONES = [
  { zone: 'Amérique du Nord', pays: ['Canada', 'États-Unis'] },
  { zone: 'Europe', pays: ['Allemagne', 'France'] },
  { zone: 'Japon', pays: ['Japon'] },
  { zone: 'Asie-Pacifique (hors Japon)', pays: ['Australie'] },
  { zone: 'Marchés émergents', pays: ['Chine', 'Inde'] },
  { zone: 'Autres zones', pays: [] },
]

describe('AidePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('affiche les 6 zones géographiques renvoyées par l’API, pays inclus', async () => {
    vi.mocked(api.getZonesGeographiques).mockResolvedValue(ZONES)
    render(<AidePage />)

    await screen.findByText('Amérique du Nord')
    expect(screen.getByText('États-Unis')).toBeInTheDocument()
    expect(screen.getByText('France')).toBeInTheDocument()
    expect(screen.getByText('Inde')).toBeInTheDocument()
    // "Autres zones" n'a pas de liste fixe : un texte explicatif à la place
    // (cette phrase précise n'apparaît que dans la carte de zone, contrairement à
    // "catégorie résiduelle" seul qui est repris ailleurs dans la FAQ).
    expect(screen.getByText(/Pas de liste fixe/)).toBeInTheDocument()
  })

  it('affiche un message d’erreur si la récupération des zones échoue', async () => {
    vi.mocked(api.getZonesGeographiques).mockRejectedValue(new Error('Panne réseau simulée'))
    render(<AidePage />)

    await screen.findByText('Panne réseau simulée')
  })

  it('Réessayer relance getZonesGeographiques (backlog 2.K.5)', async () => {
    vi.mocked(api.getZonesGeographiques).mockRejectedValueOnce(new Error('Panne réseau simulée'))
    render(<AidePage />)
    await screen.findByText('Panne réseau simulée')

    vi.mocked(api.getZonesGeographiques).mockResolvedValueOnce(ZONES)
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }))

    await screen.findByText('Amérique du Nord')
    expect(api.getZonesGeographiques).toHaveBeenCalledTimes(2)
  })

  it('affiche les 11 secteurs (contenu statique, indépendant de l’API)', async () => {
    vi.mocked(api.getZonesGeographiques).mockResolvedValue(ZONES)
    render(<AidePage />)

    expect(screen.getByText("Technologies de l'information")).toBeInTheDocument()
    expect(screen.getByText('Immobilier')).toBeInTheDocument()
  })

  it('le contenu des questions repliables n’apparaît qu’après un clic (accordéon natif)', async () => {
    vi.mocked(api.getZonesGeographiques).mockResolvedValue(ZONES)
    render(<AidePage />)

    // "look-through" apparaît aussi bien dans la question que dans sa réponse :
    // matcher restreint au <summary> pour ne cibler que la question.
    const question = screen.getByText(
      (content, element) => element?.tagName.toLowerCase() === 'summary' && content.includes('look-through'),
    )
    // Le texte de la réponse est déjà présent dans le DOM (élément <details> natif),
    // simplement masqué tant que l'utilisateur n'a pas cliqué sur la question.
    const details = question.closest('details')
    expect(details).not.toBeNull()
    expect(details).not.toHaveAttribute('open')

    fireEvent.click(question)
    expect(details).toHaveAttribute('open')
  })
})
