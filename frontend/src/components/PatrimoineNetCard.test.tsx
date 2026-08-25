import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { api } from '../api/client'
import type { PatrimoineNet, PortfolioHistoryPoint } from '../api/types'
import { PreferencesAffichageContext, type Lentille } from '../contexts/preferencesAffichageContextObject'
import { PERIODE_DEFAUT, type Periode } from '../utils/periode'
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
function renderCard(
  lentille: Lentille = 'net',
  detenteurId: number | null = null,
  historiquePortefeuille?: { points: PortfolioHistoryPoint[] | null; loading: boolean },
  periode: Periode = PERIODE_DEFAUT,
) {
  return render(
    <PreferencesAffichageContext.Provider
      value={{
        lentille,
        setLentille: vi.fn(),
        montantsMasques: false,
        toggleMontantsMasques: vi.fn(),
        detenteurId,
        setDetenteurId: vi.fn(),
        periode,
        setPeriode: vi.fn(),
      }}
    >
      <PatrimoineNetCard historiquePortefeuille={historiquePortefeuille} />
    </PreferencesAffichageContext.Provider>,
  )
}

function point(overrides: Partial<PortfolioHistoryPoint> = {}): PortfolioHistoryPoint {
  return { date: '2026-01-01', valeur_portefeuille: 0, valeur_investie: 0, valeur_realisee_cumulee: 0, ...overrides }
}

describe('PatrimoineNetCard', () => {
  it("n'affiche rien tant qu'aucun actif ni passif n'est enregistré", async () => {
    vi.mocked(api.getPatrimoineNet).mockResolvedValue(patrimoine())
    const { container } = renderCard()

    // Attend la fin du chargement (le squelette disparaît), pas seulement l'appel
    // API lui-même — sinon la vérification peut s'exécuter pendant que le squelette
    // est encore affiché (backlog 2.K.5).
    await vi.waitFor(() => expect(container).toBeEmptyDOMElement())
  })

  it('affiche un squelette pendant le chargement, jamais une carte vide', () => {
    vi.mocked(api.getPatrimoineNet).mockReturnValue(new Promise(() => {}))
    render(
      <PreferencesAffichageContext.Provider
        value={{
          lentille: 'net',
          setLentille: vi.fn(),
          montantsMasques: false,
          toggleMontantsMasques: vi.fn(),
          detenteurId: null,
          setDetenteurId: vi.fn(),
          periode: PERIODE_DEFAUT,
          setPeriode: vi.fn(),
        }}
      >
        <PatrimoineNetCard />
      </PreferencesAffichageContext.Provider>,
    )

    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it("affiche EtatErreur + Réessayer si l'appel API échoue, puis les données une fois relancé (backlog 2.K.5)", async () => {
    vi.mocked(api.getPatrimoineNet).mockClear()
    vi.mocked(api.getPatrimoineNet).mockRejectedValueOnce(new Error('panne simulée'))
    renderCard()

    await screen.findByText('panne simulée')
    const bouton = screen.getByRole('button', { name: 'Réessayer' })

    vi.mocked(api.getPatrimoineNet).mockResolvedValueOnce(
      patrimoine({ actifs_totaux: 300000, passifs_totaux: 120000, patrimoine_net: 180000 }),
    )
    fireEvent.click(bouton)

    await screen.findByText('300 000 €')
    expect(api.getPatrimoineNet).toHaveBeenCalledTimes(2)
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

  it('affiche un camembert de répartition par type d\'investissement quand renseignée', async () => {
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

    // Recharts ne rend pas son SVG dans jsdom (dimensions à 0) : le conteneur est le
    // signal fiable disponible ici, le contenu du camembert lui-même est couvert par
    // un test manuel en conditions réelles (cf. vérification de cette fonctionnalité).
    await screen.findByText('Par type d\'investissement')
    expect(document.querySelector('.recharts-responsive-container')).toBeInTheDocument()
  })

  it('n\'affiche pas de camembert quand la répartition par classe est vide', async () => {
    vi.mocked(api.getPatrimoineNet).mockResolvedValue(patrimoine({ actifs_totaux: 300000, patrimoine_net: 300000, repartition_par_classe: [] }))
    renderCard()

    await screen.findByText('Actifs totaux')
    expect(screen.queryByText('Par type d\'investissement')).not.toBeInTheDocument()
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

describe('PatrimoineNetCard — variation et phrase (backlog 2.K.6)', () => {
  it("n'affiche aucune variation quand `historiquePortefeuille` est absent (hors tableau de bord)", async () => {
    vi.mocked(api.getPatrimoineNet).mockResolvedValue(patrimoine({ actifs_totaux: 1500, passifs_totaux: 500, patrimoine_net: 1000 }))
    renderCard('net', null, undefined)

    await screen.findByText('1 000 €')
    expect(screen.queryByText(/depuis|derniers?|dernière/)).not.toBeInTheDocument()
  })

  it("n'affiche aucune variation tant que l'historique est en cours de chargement", async () => {
    vi.mocked(api.getPatrimoineNet).mockResolvedValue(patrimoine({ actifs_totaux: 1500, passifs_totaux: 500, patrimoine_net: 1000 }))
    renderCard('net', null, { points: null, loading: true })

    await screen.findByText('1 000 €')
    expect(screen.queryByText(/depuis|derniers?|dernière/)).not.toBeInTheDocument()
  })

  it('affiche la variation positive et la phrase "depuis le début du suivi" (période TOUT par défaut)', async () => {
    vi.mocked(api.getPatrimoineNet).mockResolvedValue(patrimoine({ actifs_totaux: 1600, passifs_totaux: 500, patrimoine_net: 1100 }))
    renderCard('net', null, {
      points: [point({ date: '2026-01-01', valeur_portefeuille: 1000 }), point({ date: '2026-06-01', valeur_portefeuille: 1100 })],
      loading: false,
    })

    await screen.findByText('+10.0%')
    expect(screen.getByText(/depuis le début du suivi/)).toBeInTheDocument()
  })

  it('affiche la variation négative en rouge (texte-negatif), signe "-" inclus', async () => {
    vi.mocked(api.getPatrimoineNet).mockResolvedValue(patrimoine({ actifs_totaux: 1400, passifs_totaux: 500, patrimoine_net: 900 }))
    renderCard('net', null, {
      points: [point({ date: '2026-01-01', valeur_portefeuille: 1000 }), point({ date: '2026-06-01', valeur_portefeuille: 900 })],
      loading: false,
    })

    const variation = await screen.findByText('-10.0%')
    expect(variation).toHaveClass('text-negatif')
  })

  it('filtre la série sur la Période transverse active avant de calculer la variation', async () => {
    // Bornes du dernier point calées sur "aujourd'hui" (pas un mois fixe) pour que
    // ce test reste vrai toute l'année, y compris en janvier — `bornesPeriode` en
    // YTD fixe `dateFin` à la date du jour.
    const anneeEnCours = new Date().getFullYear()
    const aujourdhui = new Date().toISOString().slice(0, 10)
    vi.mocked(api.getPatrimoineNet).mockResolvedValue(patrimoine({ actifs_totaux: 1700, passifs_totaux: 500, patrimoine_net: 1200 }))
    renderCard(
      'net',
      null,
      {
        points: [
          point({ date: '2020-01-01', valeur_portefeuille: 100 }), // hors période YTD, ignoré
          point({ date: `${anneeEnCours}-01-01`, valeur_portefeuille: 1000 }),
          point({ date: aujourdhui, valeur_portefeuille: 1200 }),
        ],
        loading: false,
      },
      { type: 'relative', valeur: 'YTD' },
    )

    await screen.findByText('+20.0%')
    expect(screen.getByText(/depuis janvier/)).toBeInTheDocument()
  })
})
