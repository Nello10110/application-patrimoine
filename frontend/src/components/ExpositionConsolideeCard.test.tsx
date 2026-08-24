import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { api } from '../api/client'
import type { ExpositionConsolidee } from '../api/types'
import { PreferencesAffichageContext } from '../contexts/preferencesAffichageContextObject'
import { PERIODE_DEFAUT } from '../utils/periode'
import ExpositionConsolideeCard from './ExpositionConsolideeCard'

vi.mock('../api/client', () => ({
  api: {
    getExpositionConsolidee: vi.fn(),
  },
}))

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
    ...overrides,
  }
}

function renderCard() {
  return render(
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

  it('affiche les métriques de concentration et les répartitions', async () => {
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
    renderCard()

    await screen.findByText('AAA')
    expect(screen.getByText('60% du patrimoine')).toBeInTheDocument()
    expect(screen.getByText('95%')).toBeInTheDocument()
    expect(screen.getAllByText('Europe').length).toBeGreaterThan(0)
    expect(screen.getByText('Répartition géographique consolidée')).toBeInTheDocument()
    expect(screen.getByText("Répartition par classe d'actif")).toBeInTheDocument()
  })

  it('affiche la note sur la part estimée manuellement quand renseignée', async () => {
    vi.mocked(api.getExpositionConsolidee).mockResolvedValue(
      donnees({ valeur_totale: 10000, repartition_classe: [{ categorie: 'Immobilier', valeur: 10000 }], part_estimee_manuelle_pct: 90 }),
    )
    renderCard()

    await screen.findByText(/90% de cette valeur/)
  })
})
