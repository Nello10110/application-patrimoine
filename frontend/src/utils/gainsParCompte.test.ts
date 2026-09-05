import { describe, expect, it } from 'vitest'
import type { Compte, Holding } from '../api/types'
import { calculerGainsParCompte } from './gainsParCompte'

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

describe('calculerGainsParCompte', () => {
  it('additionne la plus-value latente (valeur - prix de revient x quantité) par compte', () => {
    const pea = compte({ id: 1, nom: 'PEA' })
    const resultat = calculerGainsParCompte([
      holding({ ticker: 'AAA', compte: pea, quantite: 10, prix_revient_moyen: 100, valeur: 1200 }),
      holding({ ticker: 'BBB', compte: pea, quantite: 5, prix_revient_moyen: 50, valeur: 200 }),
    ])

    expect(resultat).toEqual([
      {
        compteId: 1,
        compteNom: 'PEA',
        valeur: 1400, // 1200 + 200
        gain: 150, // (1200-1000) + (200-250) = 200 - 50
        gainPct: (150 / 1250) * 100,
        rendementAnnualise: null,
      },
    ])
  })

  it('exclut une ligne sans prix de revient connu (compte courant, livret...) de toutes les sommes', () => {
    const compteCourant = compte({ id: 2, nom: 'Compte courant' })
    const resultat = calculerGainsParCompte([holding({ compte: compteCourant, prix_revient_moyen: null, valeur: 5000 })])

    expect(resultat).toEqual([])
  })

  it('un compte sans aucune ligne à prix de revient connu est absent du résultat, même mélangé à un autre', () => {
    const pea = compte({ id: 1, nom: 'PEA' })
    const compteCourant = compte({ id: 2, nom: 'Compte courant' })
    const resultat = calculerGainsParCompte([
      holding({ ticker: 'AAA', compte: pea, quantite: 1, prix_revient_moyen: 100, valeur: 120 }),
      holding({ ticker: 'CASH', compte: compteCourant, prix_revient_moyen: null, valeur: 3000 }),
    ])

    expect(resultat.map((r) => r.compteId)).toEqual([1])
  })

  it('une ligne sans compte rattaché (compte: null) est ignorée', () => {
    const resultat = calculerGainsParCompte([holding({ compte: null, prix_revient_moyen: 100, quantite: 1, valeur: 120 })])

    expect(resultat).toEqual([])
  })

  it('calcule le rendement annualisé pondéré par la valeur, sur les lignes qui en ont un', () => {
    const pea = compte({ id: 1, nom: 'PEA' })
    const resultat = calculerGainsParCompte([
      holding({ ticker: 'AAA', compte: pea, quantite: 1, prix_revient_moyen: 100, valeur: 800, rendement_annualise_pct: 10 }),
      holding({ ticker: 'BBB', compte: pea, quantite: 1, prix_revient_moyen: 100, valeur: 200, rendement_annualise_pct: 20 }),
    ])

    // Pondéré par la valeur : (800*10 + 200*20) / (800+200) = 12
    expect(resultat[0].rendementAnnualise).toBeCloseTo(12)
  })

  it("une ligne sans rendement annualisé connu n'entre pas dans la moyenne pondérée", () => {
    const pea = compte({ id: 1, nom: 'PEA' })
    const resultat = calculerGainsParCompte([
      holding({ ticker: 'AAA', compte: pea, quantite: 1, prix_revient_moyen: 100, valeur: 500, rendement_annualise_pct: 8 }),
      holding({ ticker: 'BBB', compte: pea, quantite: 1, prix_revient_moyen: 100, valeur: 500, rendement_annualise_pct: null }),
    ])

    expect(resultat[0].rendementAnnualise).toBeCloseTo(8)
  })

  it('gainPct est null quand le coût total est nul (jamais une division par zéro)', () => {
    const pea = compte({ id: 1, nom: 'PEA' })
    const resultat = calculerGainsParCompte([holding({ compte: pea, quantite: 1, prix_revient_moyen: 0, valeur: 50 })])

    expect(resultat[0].gainPct).toBeNull()
  })

  it('trie les comptes par plus-value décroissante', () => {
    const compteA = compte({ id: 1, nom: 'Compte perdant' })
    const compteB = compte({ id: 2, nom: 'Compte gagnant' })
    const resultat = calculerGainsParCompte([
      holding({ ticker: 'AAA', compte: compteA, quantite: 1, prix_revient_moyen: 100, valeur: 50 }),
      holding({ ticker: 'BBB', compte: compteB, quantite: 1, prix_revient_moyen: 100, valeur: 150 }),
    ])

    expect(resultat.map((r) => r.compteNom)).toEqual(['Compte gagnant', 'Compte perdant'])
  })

  it('deux comptes du même nom mais dun id différent restent distincts (regroupement par id, pas par nom)', () => {
    const compteA = compte({ id: 1, nom: 'PEA' })
    const compteB = compte({ id: 2, nom: 'PEA' })
    const resultat = calculerGainsParCompte([
      holding({ ticker: 'AAA', compte: compteA, quantite: 1, prix_revient_moyen: 100, valeur: 120 }),
      holding({ ticker: 'BBB', compte: compteB, quantite: 1, prix_revient_moyen: 100, valeur: 90 }),
    ])

    expect(resultat).toHaveLength(2)
  })
})
