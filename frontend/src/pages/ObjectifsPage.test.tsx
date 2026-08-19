import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import userEvent from '@testing-library/user-event'

const getTargets = vi.fn()
const getDefaultTargets = vi.fn()
const setTargets = vi.fn()
const listTargetYears = vi.fn()

vi.mock('../api/client', () => ({
  api: {
    getTargets: (...args: unknown[]) => getTargets(...args),
    getDefaultTargets: (...args: unknown[]) => getDefaultTargets(...args),
    setTargets: (...args: unknown[]) => setTargets(...args),
    listTargetYears: (...args: unknown[]) => listTargetYears(...args),
  },
}))

import ObjectifsPage from './ObjectifsPage'

const DEFAUTS = {
  geo: [{ categorie: 'Europe', pourcentage_cible: 100 }],
  sector: [{ categorie: 'Santé', pourcentage_cible: 100 }],
}

describe('ObjectifsPage — échec de chargement', () => {
  beforeEach(() => {
    getTargets.mockReset()
    getDefaultTargets.mockReset().mockResolvedValue(DEFAUTS)
    setTargets.mockReset()
    listTargetYears.mockReset().mockResolvedValue([])
  })

  it('affiche le motif de l’échec au lieu de deux éditeurs vides et silencieux', async () => {
    getTargets.mockRejectedValue(new Error('Connexion au serveur impossible'))

    render(<ObjectifsPage />)

    await waitFor(() => expect(screen.getByText(/Connexion au serveur impossible/)).toBeInTheDocument())
  })

  it('désactive « Enregistrer » tant que le chargement a échoué', async () => {
    // Sans ce garde-fou, un clic sur Enregistrer écraserait les objectifs réellement
    // enregistrés par la répartition vide affichée à l’écran.
    getTargets.mockRejectedValue(new Error('Connexion au serveur impossible'))

    render(<ObjectifsPage />)

    await waitFor(() => expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeDisabled())
    expect(setTargets).not.toHaveBeenCalled()
  })

  it('recharge les objectifs au clic sur « Réessayer »', async () => {
    getTargets.mockRejectedValueOnce(new Error('Connexion au serveur impossible')).mockResolvedValueOnce([
      { id: 1, annee: 2026, type: 'geo', categorie: 'Japon', pourcentage_cible: 100 },
    ])

    render(<ObjectifsPage />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Réessayer' })).toBeInTheDocument())

    await userEvent.click(screen.getByRole('button', { name: 'Réessayer' }))

    await waitFor(() => expect(screen.getByText('Japon')).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: 'Réessayer' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeEnabled()
  })

  it('charge normalement quand l’API répond', async () => {
    getTargets.mockResolvedValue([{ id: 1, annee: 2026, type: 'sector', categorie: 'Énergie', pourcentage_cible: 100 }])

    render(<ObjectifsPage />)

    await waitFor(() => expect(screen.getByText('Énergie')).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: 'Réessayer' })).not.toBeInTheDocument()
  })
})
