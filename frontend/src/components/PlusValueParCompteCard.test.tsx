import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { Compte, Holding } from '../api/types'
import PlusValueParCompteCard from './PlusValueParCompteCard'

// Graphique recharts mis de côté (même doctrine que `AllocationChartCard.test.tsx`) :
// ce fichier verrouille le calcul affiché (tableau, masquage, état vide), pas le
// rendu recharts lui-même (`ResponsiveContainer` mesure à 0 en environnement headless).

function compte(overrides: Partial<Compte> = {}): Compte {
  return { id: 1, nom: 'PEA', etablissement: null, created_at: '2026-01-01T00:00:00', updated_at: '2026-01-01T00:00:00', ...overrides }
}

function holding(overrides: Partial<Holding> = {}): Holding {
  return {
    id: 1,
    ticker: 'AAA',
    nom: null,
    quantite: 1,
    prix_revient_moyen: null,
    compte: null,
    devise: null,
    type_actif: 'STOCK',
    origine: 'reconstruit',
    created_at: '2026-01-01T00:00:00',
    updated_at: '2026-01-01T00:00:00',
    market_data: null,
    rendement_depuis_achat_pct: null,
    rendement_annualise_pct: null,
    valeur: 0,
    valeur_estimee: null,
    date_valeur_estimee: null,
    taux_pct: null,
    zone_geo: null,
    versement_mensuel: null,
    date_acquisition: null,
    ...overrides,
  }
}

describe('PlusValueParCompteCard', () => {
  it("affiche un état vide quand aucune ligne n'a de prix de revient connu", () => {
    render(<PlusValueParCompteCard holdings={[holding({ prix_revient_moyen: null })]} montantsMasques={false} />)

    expect(screen.getByText('Rien à comparer pour l\'instant.')).toBeInTheDocument()
  })

  it('liste chaque compte avec sa plus-value en euros et en pourcentage', () => {
    const pea = compte({ id: 1, nom: 'PEA' })
    render(
      <PlusValueParCompteCard
        holdings={[holding({ compte: pea, quantite: 10, prix_revient_moyen: 100, valeur: 1200 })]}
        montantsMasques={false}
      />,
    )

    const ligne = screen.getByText('PEA').closest('tr')!
    expect(ligne).toHaveTextContent('1 200 €')
    expect(ligne).toHaveTextContent('+200 €(+20.0%)')
  })

  it('affiche "—" pour le rendement annualisé quand aucune ligne du compte ne le connaît', () => {
    const pea = compte({ id: 1, nom: 'PEA' })
    render(
      <PlusValueParCompteCard
        holdings={[holding({ compte: pea, quantite: 1, prix_revient_moyen: 100, valeur: 90, rendement_annualise_pct: null })]}
        montantsMasques={false}
      />,
    )

    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('masque les montants quand montantsMasques est actif', () => {
    const pea = compte({ id: 1, nom: 'PEA' })
    render(
      <PlusValueParCompteCard
        holdings={[holding({ compte: pea, quantite: 1, prix_revient_moyen: 100, valeur: 120 })]}
        montantsMasques={true}
      />,
    )

    expect(screen.queryByText('120 €')).not.toBeInTheDocument()
    expect(screen.getAllByText('••••••').length).toBeGreaterThan(0)
  })

  it('affiche une ligne par compte, triée par plus-value décroissante', () => {
    const gagnant = compte({ id: 1, nom: 'Compte gagnant' })
    const perdant = compte({ id: 2, nom: 'Compte perdant' })
    render(
      <PlusValueParCompteCard
        holdings={[
          holding({ ticker: 'AAA', compte: perdant, quantite: 1, prix_revient_moyen: 100, valeur: 50 }),
          holding({ ticker: 'BBB', compte: gagnant, quantite: 1, prix_revient_moyen: 100, valeur: 150 }),
        ]}
        montantsMasques={false}
      />,
    )

    const lignes = screen.getAllByRole('row').slice(1) // ignore la ligne d'en-tête
    expect(lignes[0]).toHaveTextContent('Compte gagnant')
    expect(lignes[1]).toHaveTextContent('Compte perdant')
  })
})
