import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../api/client'
import { reinitialiserPourTests as reinitialiserLogosEtablissements } from '../utils/logosEtablissements'
import { reinitialiserPourTests as reinitialiserLogosCatalogue } from '../utils/logosCatalogue'
import EtablissementLogo from './EtablissementLogo'

vi.mock('../api/client', () => ({
  api: { getLogosEtablissements: vi.fn().mockResolvedValue({}), getLogosCatalogue: vi.fn().mockResolvedValue({}) },
}))

describe('EtablissementLogo', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    reinitialiserLogosEtablissements()
    reinitialiserLogosCatalogue()
    vi.mocked(api.getLogosEtablissements).mockResolvedValue({})
    vi.mocked(api.getLogosCatalogue).mockResolvedValue({})
  })

  it('affiche un badge coloré avec les initiales pour un établissement connu du catalogue', () => {
    render(<EtablissementLogo logoKey="trade_republic" nom="Trade Republic" />)

    const badge = screen.getByText('TR')
    expect(badge).toHaveStyle({ backgroundColor: '#1b1b1f' })
  })

  it('affiche un badge neutre (icône générique) pour une clé absente du catalogue', () => {
    render(<EtablissementLogo logoKey="etablissement_disparu_du_catalogue" nom="Établissement custom" />)

    expect(screen.queryByText('TR')).not.toBeInTheDocument()
    expect(document.querySelector('svg')).toBeInTheDocument()
  })

  it('affiche un badge neutre quand aucune clé n\'est fournie (établissement personnalisé)', () => {
    render(<EtablissementLogo logoKey={null} nom="Ma banque perso" />)

    expect(document.querySelector('svg')).toBeInTheDocument()
  })

  // Retour utilisateur du 09/09/2026 : « avoir déjà les images des établissements
  // affichées » — avant même la création d'un `Etablissement`, dans le sélecteur.
  it('affiche le vrai logo du CATALOGUE (avant toute création) quand le cache partagé en connaît un pour cette clé', async () => {
    vi.mocked(api.getLogosCatalogue).mockResolvedValue({ trade_republic: 'data:image/png;base64,AAA' })
    render(<EtablissementLogo logoKey="trade_republic" nom="Trade Republic" />)

    // Le premier rendu retombe sur les initiales (cache pas encore chargé) — l'image
    // apparaît une fois `chargerLogosCatalogue()` résolu.
    await waitFor(() => expect(document.querySelector('img')).toBeInTheDocument())
    expect(screen.queryByText('TR')).not.toBeInTheDocument()
  })

  it("le logo réel POSÉ sur l'établissement prime sur celui du catalogue", async () => {
    vi.mocked(api.getLogosEtablissements).mockResolvedValue({ '3': 'data:image/png;base64,PROPRE' })
    vi.mocked(api.getLogosCatalogue).mockResolvedValue({ trade_republic: 'data:image/png;base64,CATALOGUE' })
    render(<EtablissementLogo etablissementId={3} logoKey="trade_republic" nom="Trade Republic" />)

    await waitFor(() => expect(document.querySelector('img')).toHaveAttribute('src', 'data:image/png;base64,PROPRE'))
  })
})
