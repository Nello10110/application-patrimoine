import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { api } from '../api/client'
import type { PatrimoineNet } from '../api/types'
import { PreferencesAffichageContext, type Lentille } from '../contexts/preferencesAffichageContextObject'
import { PERIODE_DEFAUT } from '../utils/periode'
import PatrimoineNetCard from './PatrimoineNetCard'

vi.mock('../api/client', () => ({
  api: {
    getPatrimoineNet: vi.fn(),
  },
}))

function patrimoine(overrides: Partial<PatrimoineNet> = {}): PatrimoineNet {
  return {
    actifs_totaux: 0,
    passifs_totaux: 0,
    patrimoine_net: 0,
    patrimoine_financier: 0,
    repartition_par_classe: [],
    ...overrides,
  }
}

// Lentille (backlog 2.K.3) : `PatrimoineNetCard` lit `usePreferencesAffichage()`, donc
// tout rendu doit fournir le contexte — `lentille` par défaut à 'net' (comportement
// historique de la carte, inchangé pour les tests qui ne portent pas sur K.3).
// `detenteurId` (backlog 2.L.1) par défaut à `null` (vue foyer, comportement
// historique inchangé pour les tests qui ne portent pas sur L.1).
function renderCard(lentille: Lentille = 'net', detenteurId: number | null = null) {
  return render(
    <PreferencesAffichageContext.Provider
      value={{
        lentille,
        setLentille: vi.fn(),
        montantsMasques: false,
        toggleMontantsMasques: vi.fn(),
        detenteurId,
        setDetenteurId: vi.fn(),
        periode: PERIODE_DEFAUT,
        setPeriode: vi.fn(),
      }}
    >
      <PatrimoineNetCard />
    </PreferencesAffichageContext.Provider>,
  )
}

describe('PatrimoineNetCard', () => {
  it("n'affiche rien tant qu'aucun actif ni passif n'est enregistré", async () => {
    vi.mocked(api.getPatrimoineNet).mockResolvedValue(patrimoine())
    const { container } = renderCard()

    await vi.waitFor(() => expect(api.getPatrimoineNet).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })

  it("n'affiche rien si l'appel API échoue", async () => {
    vi.mocked(api.getPatrimoineNet).mockRejectedValue(new Error('panne simulée'))
    const { container } = renderCard()

    await vi.waitFor(() => expect(api.getPatrimoineNet).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })

  it('affiche les actifs, passifs et le patrimoine net', async () => {
    vi.mocked(api.getPatrimoineNet).mockResolvedValue(
      patrimoine({ actifs_totaux: 300000, passifs_totaux: 120000, patrimoine_net: 180000 }),
    )
    renderCard()

    await screen.findByText('300 000 €')
    expect(screen.getByText('120 000 €')).toBeInTheDocument()
    expect(screen.getByText('180 000 €')).toBeInTheDocument()
  })

  it('affiche la répartition par classe quand renseignée', async () => {
    vi.mocked(api.getPatrimoineNet).mockResolvedValue(
      patrimoine({
        actifs_totaux: 300000,
        patrimoine_net: 300000,
        repartition_par_classe: [
          { categorie: 'Immobilier', valeur: 250000 },
          { categorie: 'Actions', valeur: 50000 },
        ],
      }),
    )
    renderCard()

    await screen.findByText('Immobilier')
    expect(screen.getByText('Actions')).toBeInTheDocument()
  })
})

describe('PatrimoineNetCard — lentille (backlog 2.K.3)', () => {
  const donnees = patrimoine({ actifs_totaux: 300000, passifs_totaux: 120000, patrimoine_net: 180000, patrimoine_financier: 90000 })

  it('lentille "net" (défaut) : la tuile principale affiche le patrimoine net', async () => {
    vi.mocked(api.getPatrimoineNet).mockResolvedValue(donnees)
    renderCard('net')

    // "Patrimoine net" apparaît deux fois : le titre de la carte (toujours affiché)
    // et le libellé de la tuile principale, identique dans cette lentille.
    await vi.waitFor(() => expect(screen.getAllByText('Patrimoine net')).toHaveLength(2))
    expect(screen.getAllByText('180 000 €')).toHaveLength(1)
  })

  it('lentille "brut" : la tuile principale affiche les actifs totaux (aucune dette retranchée)', async () => {
    vi.mocked(api.getPatrimoineNet).mockResolvedValue(donnees)
    renderCard('brut')

    await screen.findByText('Patrimoine brut')
    // "300 000 €" apparaît deux fois : la tuile "Actifs totaux" (toujours affichée)
    // et la tuile principale, désormais identique en lentille brut.
    expect(screen.getAllByText('300 000 €')).toHaveLength(2)
  })

  it('lentille "financier" : la tuile principale affiche le seul portefeuille financier', async () => {
    vi.mocked(api.getPatrimoineNet).mockResolvedValue(donnees)
    renderCard('financier')

    await screen.findByText('Patrimoine financier')
    expect(screen.getByText('90 000 €')).toBeInTheDocument()
  })
})

describe('PatrimoineNetCard — filtre détenteur (backlog 2.L.1)', () => {
  it('transmet detenteurId à getPatrimoineNet', async () => {
    vi.mocked(api.getPatrimoineNet).mockResolvedValue(patrimoine({ actifs_totaux: 1000, patrimoine_net: 1000 }))
    renderCard('net', 42)

    await vi.waitFor(() => expect(api.getPatrimoineNet).toHaveBeenCalledWith(42))
  })

  it('detenteurId=null (défaut) appelle getPatrimoineNet sans filtre, comme avant L.1', async () => {
    vi.mocked(api.getPatrimoineNet).mockResolvedValue(patrimoine())
    renderCard('net', null)

    await vi.waitFor(() => expect(api.getPatrimoineNet).toHaveBeenCalledWith(null))
  })
})
