import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../api/client'
import type { Etablissement } from '../api/types'
import { reinitialiserPourTests } from '../utils/logosEtablissements'
import EtablissementEditModal from './EtablissementEditModal'

vi.mock('../api/client', () => ({
  api: {
    updateEtablissement: vi.fn(),
    getLogosEtablissements: vi.fn().mockResolvedValue({}),
    recupererLogoCatalogue: vi.fn(),
    setEtablissementLogoUrl: vi.fn(),
    uploadEtablissementLogo: vi.fn(),
    deleteEtablissementLogo: vi.fn(),
  },
}))

function etablissement(overrides: Partial<Etablissement> = {}): Etablissement {
  return {
    id: 3,
    nom: 'Boursorama Banque',
    logo_key: 'boursorama',
    a_un_logo: false,
    logo_source: null,
    logo_maj_le: null,
    created_at: '2026-01-01T00:00:00',
    updated_at: '2026-01-01T00:00:00',
    ...overrides,
  }
}

function afficher(e: Etablissement = etablissement(), onEnregistre = vi.fn()) {
  render(<EtablissementEditModal etablissement={e} onClose={vi.fn()} onEnregistre={onEnregistre} />)
  return { onEnregistre }
}

describe('EtablissementEditModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    reinitialiserPourTests()
    vi.mocked(api.getLogosEtablissements).mockResolvedValue({})
  })

  it('« Récupérer le logo officiel » appelle le catalogue et prévient l\'appelant', async () => {
    vi.mocked(api.recupererLogoCatalogue).mockResolvedValue(
      etablissement({ a_un_logo: true, logo_source: 'catalogue', logo_maj_le: '2026-09-05T10:00:00' }),
    )
    const { onEnregistre } = afficher()

    fireEvent.click(screen.getByRole('button', { name: 'Récupérer le logo officiel' }))

    await waitFor(() => expect(api.recupererLogoCatalogue).toHaveBeenCalledWith(3))
    await waitFor(() => expect(onEnregistre).toHaveBeenCalled())
    expect(await screen.findByText(/récupéré sur le site officiel/)).toBeInTheDocument()
  })

  it("« Récupérer le logo officiel » est désactivé pour un établissement hors catalogue", () => {
    afficher(etablissement({ logo_key: null, nom: 'Ma banque perso' }))

    expect(screen.getByRole('button', { name: 'Récupérer le logo officiel' })).toBeDisabled()
  })

  it('saisir une adresse appelle setEtablissementLogoUrl', async () => {
    vi.mocked(api.setEtablissementLogoUrl).mockResolvedValue(etablissement({ a_un_logo: true, logo_source: 'url' }))
    afficher()

    fireEvent.change(screen.getByLabelText(/Adresse d'une image/), { target: { value: 'https://exemple.fr/logo.png' } })
    fireEvent.click(screen.getByRole('button', { name: 'Utiliser cette adresse' }))

    await waitFor(() =>
      expect(api.setEtablissementLogoUrl).toHaveBeenCalledWith(3, 'https://exemple.fr/logo.png'),
    )
  })

  it('téléverser une image appelle uploadEtablissementLogo', async () => {
    vi.mocked(api.uploadEtablissementLogo).mockResolvedValue(etablissement({ a_un_logo: true, logo_source: 'upload' }))
    afficher()

    const fichier = new File(['png'], 'logo.png', { type: 'image/png' })
    fireEvent.change(screen.getByLabelText('Image du logo'), { target: { files: [fichier] } })

    await waitFor(() => expect(api.uploadEtablissementLogo).toHaveBeenCalledWith(3, fichier))
  })

  it('« Retirer le logo » n\'apparaît que quand un logo existe', () => {
    const { unmount } = render(
      <EtablissementEditModal etablissement={etablissement()} onClose={vi.fn()} onEnregistre={vi.fn()} />,
    )
    expect(screen.queryByRole('button', { name: 'Retirer le logo' })).not.toBeInTheDocument()
    unmount()

    afficher(etablissement({ a_un_logo: true, logo_source: 'upload' }))
    expect(screen.getByRole('button', { name: 'Retirer le logo' })).toBeInTheDocument()
  })

  it("une erreur du serveur (adresse refusée) reste affichée dans la vue", async () => {
    vi.mocked(api.setEtablissementLogoUrl).mockRejectedValue(
      new Error('Cette adresse pointe vers le réseau local ou une adresse réservée — refusée par sécurité.'),
    )
    afficher()

    fireEvent.change(screen.getByLabelText(/Adresse d'une image/), { target: { value: 'https://interne/logo.png' } })
    fireEvent.click(screen.getByRole('button', { name: 'Utiliser cette adresse' }))

    expect(await screen.findByText(/refusée par sécurité/)).toBeInTheDocument()
  })

  it('renommer appelle updateEtablissement, et le bouton reste inactif tant que le nom ne change pas', async () => {
    vi.mocked(api.updateEtablissement).mockResolvedValue(etablissement({ nom: 'Nouveau nom' }))
    afficher()

    expect(screen.getByRole('button', { name: 'Renommer' })).toBeDisabled()

    fireEvent.change(screen.getByLabelText('Nom'), { target: { value: 'Nouveau nom' } })
    fireEvent.click(screen.getByRole('button', { name: 'Renommer' }))

    await waitFor(() => expect(api.updateEtablissement).toHaveBeenCalledWith(3, 'Nouveau nom'))
  })
})
