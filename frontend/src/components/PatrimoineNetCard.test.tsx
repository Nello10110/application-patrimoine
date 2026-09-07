import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { api } from '../api/client'
import type { PatrimoineHistoryPoint, PatrimoineNet, PortfolioHistoryPoint } from '../api/types'
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
    repartition_par_classe_financiere: [],
    repartition_par_classe_nette: [],
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
  historiquePatrimoine?: { points: PatrimoineHistoryPoint[] | null; loading: boolean },
) {
  // `MemoryRouter` depuis la refonte (étape 4) : les trois poches sous le chiffre
  // héros sont des liens vers l'écran où leur part se détaille.
  return render(
    <MemoryRouter>
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
      <PatrimoineNetCard historiquePortefeuille={historiquePortefeuille} historiquePatrimoine={historiquePatrimoine} />
    </PreferencesAffichageContext.Provider>
    </MemoryRouter>,
  )
}

function point(overrides: Partial<PortfolioHistoryPoint> = {}): PortfolioHistoryPoint {
  return { date: '2026-01-01', valeur_portefeuille: 0, valeur_investie: 0, valeur_realisee_cumulee: 0, ...overrides }
}

function pointPatrimoine(overrides: Partial<PatrimoineHistoryPoint> = {}): PatrimoineHistoryPoint {
  return {
    date: '2026-01-01',
    valeur_financiere: 0,
    valeur_manuelle: 0,
    actifs_totaux: 0,
    passifs_totaux: 0,
    patrimoine_net: 0,
    patrimoine_financier: 0,
    valeur_investie: 0,
    valeur_investie_nette: 0,
    valeur_realisee_cumulee: 0,
    ...overrides,
  }
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

  it("affiche la barre empilée et les montants exacts de la répartition par type d'investissement", async () => {
    const repartition = [
      { categorie: 'Immobilier', valeur: 250000 },
      { categorie: 'Actions', valeur: 50000 },
    ]
    vi.mocked(api.getPatrimoineNet).mockResolvedValue(
      patrimoine({
        actifs_totaux: 300000,
        patrimoine_net: 300000,
        // `renderCard()` par défaut = lentille "net" (comportement historique de ce
        // test, antérieur à la feature Net/Brut/Financier) : `repartition_par_classe_nette`
        // renseignée à l'identique, ce test portant sur la coexistence camembert+liste,
        // pas sur le calcul de nettage par ligne (couvert par des tests dédiés plus bas).
        repartition_par_classe: repartition,
        repartition_par_classe_nette: repartition,
      }),
    )
    renderCard()

    // Recharts ne rend pas son SVG dans jsdom (dimensions à 0) : le conteneur est le
    // signal fiable disponible ici, le contenu du camembert lui-même est couvert par
    // un test manuel en conditions réelles (cf. vérification de cette fonctionnalité).
    await screen.findByText('Par type d\'investissement')
    expect(screen.getByTitle('Immobilier : 250 000 €')).toBeInTheDocument()

    // La liste détaillée d'origine reste affichée en plus du camembert, pas remplacée.
    expect(screen.getByText('250 000 €')).toBeInTheDocument()
    expect(screen.getByText('50 000 €')).toBeInTheDocument()
  })

  it('n\'affiche pas de camembert quand la répartition par classe est vide', async () => {
    vi.mocked(api.getPatrimoineNet).mockResolvedValue(patrimoine({ actifs_totaux: 300000, patrimoine_net: 300000, repartition_par_classe: [] }))
    renderCard()

    await screen.findByText('Financier')
    expect(screen.queryByText('Par type d\'investissement')).not.toBeInTheDocument()
  })
})

/** Zone « Par type d'investissement » : depuis la refonte, ce n'est plus une `<ul>`
 * mais une grille de légende sous la barre empilée. */
async function zoneRepartition() {
  const titre = await screen.findByText("Par type d'investissement")
  return titre.parentElement as HTMLElement
}

describe('PatrimoineNetCard — lentille (backlog 2.K.3)', () => {
  const donnees = patrimoine({ actifs_totaux: 300000, passifs_totaux: 120000, patrimoine_net: 180000, patrimoine_financier: 90000 })

  it('lentille "net" (défaut) : la tuile principale affiche le patrimoine net', async () => {
    vi.mocked(api.getPatrimoineNet).mockResolvedValue(donnees)
    renderCard('net')

    // Sur-titre unique depuis la refonte (« Patrimoine net · Foyer ») : le titre de
    // carte qui répétait le même libellé a disparu — un seul chiffre héros, annoncé
    // une seule fois.
    await screen.findByText('Patrimoine net · Foyer')
    expect(screen.getAllByText('180 000 €')).toHaveLength(1)
  })

  it('lentille "brut" : la tuile principale affiche les actifs totaux (aucune dette retranchée)', async () => {
    vi.mocked(api.getPatrimoineNet).mockResolvedValue(donnees)
    renderCard('brut')

    await screen.findByText('Patrimoine brut · Foyer')
    // Le chiffre héros seul : les poches sous lui montrent la ventilation
    // (financier / immobilier & épargne / emprunts), pas le total répété.
    expect(screen.getAllByText('300 000 €')).toHaveLength(1)
  })

  it('lentille "financier" : la tuile principale affiche le seul portefeuille financier', async () => {
    vi.mocked(api.getPatrimoineNet).mockResolvedValue(donnees)
    renderCard('financier')

    await screen.findByText('Patrimoine financier · Foyer')
    // Le même montant apparaît deux fois en lentille financière : le chiffre héros
    // et la poche « Financier », qui vaut par construction le même total.
    expect(screen.getAllByText('90 000 €')).toHaveLength(2)
  })

  it('lentille "financier" : le camembert/liste utilise `repartition_par_classe_financiere`, pas la répartition tous-actifs', async () => {
    vi.mocked(api.getPatrimoineNet).mockResolvedValue(
      patrimoine({
        actifs_totaux: 300000,
        patrimoine_net: 300000,
        patrimoine_financier: 50000,
        repartition_par_classe: [
          { categorie: 'Immobilier', valeur: 250000 },
          { categorie: 'Actions', valeur: 50000 },
        ],
        repartition_par_classe_financiere: [{ categorie: 'Actions', valeur: 50000 }],
      }),
    )
    renderCard('financier')

    await screen.findByText('Par type d\'investissement')
    expect(screen.getByText('Actions')).toBeInTheDocument()
    expect(screen.queryByText('Immobilier')).not.toBeInTheDocument()
  })

  it('lentille "brut" : le camembert/liste garde `repartition_par_classe` en valeur BRUTE (retour utilisateur : Brut inchangé)', async () => {
    vi.mocked(api.getPatrimoineNet).mockResolvedValue(
      patrimoine({
        actifs_totaux: 300000,
        patrimoine_net: 180000,
        repartition_par_classe: [{ categorie: 'Immobilier', valeur: 300000 }],
        repartition_par_classe_nette: [{ categorie: 'Immobilier', valeur: 180000 }],
      }),
    )
    renderCard('brut')

    await screen.findByText('Par type d\'investissement')
    const liste = await zoneRepartition()
    expect(within(liste).getByText('300 000 €')).toBeInTheDocument()
  })

  it('lentille "net" : le camembert/liste utilise `repartition_par_classe_nette` (chaque ligne nettée de son emprunt rattaché)', async () => {
    vi.mocked(api.getPatrimoineNet).mockResolvedValue(
      patrimoine({
        actifs_totaux: 300000,
        passifs_totaux: 120000,
        patrimoine_net: 180000,
        repartition_par_classe: [{ categorie: 'Immobilier', valeur: 300000 }],
        repartition_par_classe_nette: [{ categorie: 'Immobilier', valeur: 180000 }],
      }),
    )
    renderCard('net')

    await screen.findByText('Par type d\'investissement')
    const liste = await zoneRepartition()
    expect(within(liste).getByText('180 000 €')).toBeInTheDocument()
  })

  it('lentille "net" : une catégorie à valeur négative (équité négative) s\'affiche dans la liste en rouge, jamais dans le camembert', async () => {
    vi.mocked(api.getPatrimoineNet).mockResolvedValue(
      patrimoine({
        actifs_totaux: 100000,
        passifs_totaux: 150000,
        patrimoine_net: -50000,
        repartition_par_classe_nette: [{ categorie: 'Immobilier', valeur: -50000 }],
      }),
    )
    renderCard('net')

    await screen.findByText('Par type d\'investissement')
    const liste = await zoneRepartition()
    const montant = within(liste).getByText('-50 000 €')
    expect(montant).toHaveClass('text-neg')
    // Une part négative n'a aucune largeur dans une barre empilée : aucun segment
    // n'est dessiné pour elle (seule catégorie disponible ici, donc aucune barre).
    expect(screen.queryByTitle(/-50 000 €/)).not.toBeInTheDocument()
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

  // Les quatre tests suivants portaient historiquement sur `renderCard('net', ...)` :
  // avant la feature Net/Brut/Financier sur toute la page Synthèse, la variation
  // venait TOUJOURS de `historiquePortefeuille` (portefeuille financier) quelle que
  // soit la lentille — précisément le bug que cette feature corrige (cf. contexte du
  // plan). Ces tests portent donc désormais explicitement sur la lentille
  // "financier", seule à encore lire `historiquePortefeuille` pour sa variation ; de
  // nouveaux tests couvrent "brut"/"net" via `historiquePatrimoine` juste après.

  it('lentille "financier" : affiche la variation positive et la phrase "depuis le début du suivi" (période TOUT par défaut)', async () => {
    vi.mocked(api.getPatrimoineNet).mockResolvedValue(patrimoine({ actifs_totaux: 1600, passifs_totaux: 500, patrimoine_net: 1100, patrimoine_financier: 1100 }))
    renderCard('financier', null, {
      points: [point({ date: '2026-01-01', valeur_portefeuille: 1000 }), point({ date: '2026-06-01', valeur_portefeuille: 1100 })],
      loading: false,
    })

    await screen.findByText('↑ 10.0 %')
    expect(screen.getByText(/depuis le début du suivi/)).toBeInTheDocument()
  })

  it('lentille "financier" : affiche la variation négative en rouge (texte-negatif), signe "-" inclus', async () => {
    vi.mocked(api.getPatrimoineNet).mockResolvedValue(patrimoine({ actifs_totaux: 1400, passifs_totaux: 500, patrimoine_net: 900, patrimoine_financier: 900 }))
    renderCard('financier', null, {
      points: [point({ date: '2026-01-01', valeur_portefeuille: 1000 }), point({ date: '2026-06-01', valeur_portefeuille: 900 })],
      loading: false,
    })

    const variation = await screen.findByText('↓ 10.0 %')
    expect(variation).toHaveClass('text-neg')
  })

  it('lentille "financier" : filtre la série sur la Période transverse active avant de calculer la variation', async () => {
    // Bornes du dernier point calées sur "aujourd'hui" (pas une date fixe) pour que
    // ce test reste vrai toute l'année — `bornesPeriode` fixe `dateFin` au jour même.
    const aujourdhui = new Date().toISOString().slice(0, 10)
    const ilYAUnMois = new Date(Date.now() - 20 * 24 * 3600 * 1000).toISOString().slice(0, 10)
    vi.mocked(api.getPatrimoineNet).mockResolvedValue(patrimoine({ actifs_totaux: 1700, passifs_totaux: 500, patrimoine_net: 1200, patrimoine_financier: 1200 }))
    renderCard(
      'financier',
      null,
      {
        points: [
          point({ date: '2020-01-01', valeur_portefeuille: 100 }), // hors des 3 derniers mois, ignoré
          point({ date: ilYAUnMois, valeur_portefeuille: 1000 }),
          point({ date: aujourdhui, valeur_portefeuille: 1200 }),
        ],
        loading: false,
      },
      { type: 'relative', valeur: '3M' },
    )

    await screen.findByText('↑ 20.0 %')
    expect(screen.getByText(/sur les 3 derniers mois/)).toBeInTheDocument()
  })

  it('lentille "brut" : la variation vient de `historiquePatrimoine.actifs_totaux`, pas du portefeuille financier', async () => {
    vi.mocked(api.getPatrimoineNet).mockResolvedValue(patrimoine({ actifs_totaux: 1100, passifs_totaux: 0, patrimoine_net: 1100 }))
    renderCard('brut', null, undefined, PERIODE_DEFAUT, {
      points: [pointPatrimoine({ date: '2026-01-01', actifs_totaux: 1000 }), pointPatrimoine({ date: '2026-06-01', actifs_totaux: 1100 })],
      loading: false,
    })

    await screen.findByText('↑ 10.0 %')
    expect(screen.getByText(/depuis le début du suivi/)).toBeInTheDocument()
  })

  it('lentille "net" : la variation vient de `historiquePatrimoine.patrimoine_net`, pas du portefeuille financier', async () => {
    vi.mocked(api.getPatrimoineNet).mockResolvedValue(patrimoine({ actifs_totaux: 900, passifs_totaux: 0, patrimoine_net: 900 }))
    renderCard('net', null, undefined, PERIODE_DEFAUT, {
      points: [pointPatrimoine({ date: '2026-01-01', patrimoine_net: 1000 }), pointPatrimoine({ date: '2026-06-01', patrimoine_net: 900 })],
      loading: false,
    })

    const variation = await screen.findByText('↓ 10.0 %')
    expect(variation).toHaveClass('text-neg')
  })
})
