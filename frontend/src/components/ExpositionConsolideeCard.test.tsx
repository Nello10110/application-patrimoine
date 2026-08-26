import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { api } from '../api/client'
import type { ExpositionConsolidee } from '../api/types'
import { PreferencesAffichageContext, type Lentille } from '../contexts/preferencesAffichageContextObject'
import { PERIODE_DEFAUT } from '../utils/periode'
import ExpositionConsolideeCard from './ExpositionConsolideeCard'

vi.mock('../api/client', () => ({
  api: {
    getExpositionConsolidee: vi.fn(),
  },
}))

// Champs par défaut = valeur BRUTE nulle partout ; les tests qui ne portent pas sur la
// lentille Net/Brut/Financier (backlog 2.S.2) utilisent `renderCard()` par défaut =
// lentille "brut", donc les champs sans suffixe `_nette` ci-dessous suffisent.
function donnees(overrides: Partial<ExpositionConsolidee> = {}): ExpositionConsolidee {
  return {
    valeur_totale: 0,
    repartition_geo: [],
    repartition_classe: [],
    plus_grosse_ligne_ticker: null,
    plus_grosse_ligne_pct: null,
    top5_lignes_pct: null,
    premiere_zone_geo: null,
    premiere_zone_geo_pct: null,
    part_estimee_manuelle_pct: 0,
    valeur_totale_nette: 0,
    repartition_geo_nette: [],
    repartition_classe_nette: [],
    plus_grosse_ligne_ticker_nette: null,
    plus_grosse_ligne_pct_nette: null,
    top5_lignes_pct_nette: null,
    premiere_zone_geo_nette: null,
    premiere_zone_geo_pct_nette: null,
    part_estimee_manuelle_pct_nette: 0,
    ...overrides,
  }
}

function renderCard(lentille: Lentille = 'brut') {
  return render(
    <PreferencesAffichageContext.Provider
      value={{
        lentille,
        setLentille: vi.fn(),
        montantsMasques: false,
        toggleMontantsMasques: vi.fn(),
        detenteurId: null,
        setDetenteurId: vi.fn(),
        periode: PERIODE_DEFAUT,
        setPeriode: vi.fn(),
      }}
    >
      <ExpositionConsolideeCard />
    </PreferencesAffichageContext.Provider>,
  )
}

describe('ExpositionConsolideeCard', () => {
  it('affiche un squelette pendant le chargement', () => {
    vi.mocked(api.getExpositionConsolidee).mockReturnValue(new Promise(() => {}))
    const { container } = renderCard()

    expect(container.querySelector('[aria-hidden="true"]')).toBeInTheDocument()
  })

  it("affiche EtatErreur + Réessayer si l'appel échoue, puis les données une fois relancé", async () => {
    vi.mocked(api.getExpositionConsolidee).mockRejectedValueOnce(new Error('panne simulée'))
    renderCard()

    await screen.findByText('panne simulée')
    const bouton = screen.getByRole('button', { name: 'Réessayer' })

    vi.mocked(api.getExpositionConsolidee).mockResolvedValueOnce(
      donnees({ valeur_totale: 10000, plus_grosse_ligne_ticker: 'AAA', plus_grosse_ligne_pct: 60 }),
    )
    fireEvent.click(bouton)

    await screen.findByText('AAA')
  })

  it('affiche un état vide quand aucun actif n’est valorisé', async () => {
    vi.mocked(api.getExpositionConsolidee).mockResolvedValue(donnees())
    renderCard()

    await screen.findByText('Aucun actif valorisé.')
  })

  it('affiche les métriques de concentration et les répartitions (lentille Brut)', async () => {
    vi.mocked(api.getExpositionConsolidee).mockResolvedValue(
      donnees({
        valeur_totale: 10000,
        plus_grosse_ligne_ticker: 'AAA',
        plus_grosse_ligne_pct: 60,
        top5_lignes_pct: 95,
        premiere_zone_geo: 'Europe',
        premiere_zone_geo_pct: 80,
        repartition_geo: [{ categorie: 'Europe', valeur: 8000 }],
        repartition_classe: [{ categorie: 'Actions', valeur: 10000 }],
      }),
    )
    renderCard('brut')

    await screen.findByText('AAA')
    expect(screen.getByText('60% du patrimoine')).toBeInTheDocument()
    expect(screen.getByText('95%')).toBeInTheDocument()
    expect(screen.getAllByText('Europe').length).toBeGreaterThan(0)
    expect(screen.getByText('Répartition géographique consolidée')).toBeInTheDocument()
    expect(screen.getByText("Répartition par classe d'actif")).toBeInTheDocument()
    expect(screen.getByText(/valeur brute/)).toBeInTheDocument()
  })

  it('affiche la note sur la part estimée manuellement quand renseignée', async () => {
    vi.mocked(api.getExpositionConsolidee).mockResolvedValue(
      donnees({ valeur_totale: 10000, repartition_classe: [{ categorie: 'Immobilier', valeur: 10000 }], part_estimee_manuelle_pct: 90 }),
    )
    renderCard()

    await screen.findByText(/90% de cette valeur/)
  })
})

describe('ExpositionConsolideeCard — lentille Net/Brut/Financier (backlog 2.S.2)', () => {
  // Retour utilisateur (26/08/2026) : une première correction nettait la carte de
  // façon inconditionnelle, si bien que Net et Brut affichaient exactement les mêmes
  // pourcentages — bug repéré par l'utilisateur en comparant "62% Europe" dans les
  // deux vues. Ces tests verrouillent que les deux lentilles utilisent désormais des
  // champs distincts (`_nette` vs bruts), avec des valeurs volontairement différentes
  // pour détecter toute régression vers le bug initial.
  const jeuDeDonnees = donnees({
    valeur_totale: 300000,
    repartition_classe: [{ categorie: 'Immobilier', valeur: 300000 }],
    plus_grosse_ligne_ticker: 'MAISON',
    plus_grosse_ligne_pct: 100,
    valeur_totale_nette: 180000,
    repartition_classe_nette: [{ categorie: 'Immobilier', valeur: 180000 }],
    plus_grosse_ligne_ticker_nette: 'MAISON',
    plus_grosse_ligne_pct_nette: 100,
  })

  it('lentille "brut" : affiche la valeur BRUTE (300 000 €), pas la nette', async () => {
    vi.mocked(api.getExpositionConsolidee).mockResolvedValue(jeuDeDonnees)
    renderCard('brut')

    expect(await screen.findByText(/300 000 €/)).toBeInTheDocument()
    expect(screen.queryByText(/180 000 €/)).not.toBeInTheDocument()
  })

  it('lentille "net" : affiche la valeur NETTE (180 000 €), pas la brute — même jeu de données que le test "brut" ci-dessus', async () => {
    vi.mocked(api.getExpositionConsolidee).mockResolvedValue(jeuDeDonnees)
    renderCard('net')

    expect(await screen.findByText(/180 000 €/)).toBeInTheDocument()
    expect(screen.queryByText(/300 000 €/)).not.toBeInTheDocument()
  })

  it('lentille "financier" : la carte est masquée (pas de pseudo-exposition "tous actifs" restreinte au financier)', async () => {
    vi.mocked(api.getExpositionConsolidee).mockResolvedValue(jeuDeDonnees)
    const { container } = renderCard('financier')

    // `getExpositionConsolidee` n'est même pas censé bloquer le rendu : la carte est
    // `null` avant que la promesse ne soit résolue.
    expect(container).toBeEmptyDOMElement()
  })
})
