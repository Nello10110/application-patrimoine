import { describe, expect, it } from 'vitest'
import { agregerParAnnee, calculerFire, calculerTrajectoire, calculerTrajectoireMensuelle } from './interetsComposes'

describe('calculerTrajectoire — intérêts composés mensuels + versement mensuel', () => {
  it('taux nul, sans versement : la valeur ne bouge jamais', () => {
    const points = calculerTrajectoire(1000, 0, 0, 3)
    expect(points.map((p) => p.valeur)).toEqual([1000, 1000, 1000, 1000])
    expect(points[3].investi).toBe(1000)
  })

  it('1000€ à 12%/an sur 1 an, sans versement ≈ 1000 × 1,01^12 (capitalisation mensuelle)', () => {
    const points = calculerTrajectoire(1000, 12, 0, 1)
    expect(points[1].valeur).toBeCloseTo(1000 * Math.pow(1.01, 12), 2)
    expect(points[1].investi).toBe(1000) // aucun versement : le capital versé ne bouge pas
  })

  it('versement mensuel constant sans capital ni rendement : simple accumulation', () => {
    const points = calculerTrajectoire(0, 0, 100, 2)
    expect(points[1].valeur).toBe(1200) // 12 × 100
    expect(points[2].valeur).toBe(2400) // 24 × 100
    expect(points[2].investi).toBe(2400)
  })
})

describe('calculerTrajectoireMensuelle', () => {
  it("l'état initial (mois 0) porte le capital de départ, sans intérêt", () => {
    const points = calculerTrajectoireMensuelle(1000, 5, 100, 1)
    expect(points[0]).toEqual({
      moisIndex: 0,
      annee: 0,
      moisDeLAnnee: 0,
      versement: 1000,
      interets: 0,
      capital: 1000,
      verseCumule: 1000,
      interetsCumules: 0,
    })
  })

  it("un versement ne produit son premier intérêt qu'au mois suivant (pas le mois même)", () => {
    // 1200€ à 12%/an (1%/mois), versement de 100€/mois.
    const points = calculerTrajectoireMensuelle(1200, 12, 100, 1)
    // Mois 1 : intérêt = 1200 × 1% = 12 (calculé AVANT l'ajout des 100€ de versement).
    expect(points[1].interets).toBeCloseTo(12, 6)
    expect(points[1].capital).toBeCloseTo(1200 + 12 + 100, 6)
    expect(points[1].versement).toBe(100)
    // Mois 2 : intérêt calculé sur le capital de fin de mois 1 (1312), pas sur 1200 + 200.
    expect(points[2].interets).toBeCloseTo(1312 * 0.01, 6)
  })

  it('produit bien 12 × annees lignes, plus la ligne initiale', () => {
    const points = calculerTrajectoireMensuelle(0, 5, 0, 3)
    expect(points).toHaveLength(3 * 12 + 1)
    expect(points[points.length - 1].annee).toBe(3)
    expect(points[points.length - 1].moisDeLAnnee).toBe(12)
  })

  it('le dernier mois de chaque année correspond exactement à calculerTrajectoire', () => {
    const mensuel = calculerTrajectoireMensuelle(5000, 7, 150, 4)
    const annuel = calculerTrajectoire(5000, 7, 150, 4)
    for (const point of annuel) {
      const ligneMensuelle = point.annee === 0 ? mensuel[0] : mensuel.find((p) => p.annee === point.annee && p.moisDeLAnnee === 12)
      expect(ligneMensuelle?.capital).toBe(point.valeur)
      expect(ligneMensuelle?.verseCumule).toBe(point.investi)
    }
  })
})

describe('agregerParAnnee', () => {
  it('somme les versements et les intérêts mois par mois sur chaque année', () => {
    const mensuel = calculerTrajectoireMensuelle(1000, 6, 50, 2)
    const annuel = agregerParAnnee(mensuel)

    expect(annuel).toHaveLength(3) // année 0 (initial) + 2 années
    expect(annuel[0]).toEqual({ annee: 0, versements: 1000, interets: 0, capital: 1000, verseCumule: 1000, interetsCumules: 0 })

    // Versements de l'année 1 = 12 × 50 = 600.
    expect(annuel[1].versements).toBe(600)
    expect(annuel[1].annee).toBe(1)
    // Capital et cumuls de fin d'année cohérents avec la vue mensuelle.
    const finAnnee1 = mensuel.find((p) => p.annee === 1 && p.moisDeLAnnee === 12)!
    expect(annuel[1].capital).toBe(finAnnee1.capital)
    expect(annuel[1].interetsCumules).toBe(finAnnee1.interetsCumules)

    // La somme des intérêts mensuels de l'année 2 doit égaler l'intérêt annuel agrégé.
    const sommeInteretsAnnee2 = mensuel.filter((p) => p.annee === 2).reduce((acc, p) => acc + p.interets, 0)
    expect(annuel[2].interets).toBeCloseTo(sommeInteretsAnnee2, 6)
  })
})

// Scénarios repris de l'ancien module backend `simulation_service.py`
// (`test_simulation_service.py`) : même formule, même comportement attendu, pour
// garantir que la migration côté client n'a rien changé au calcul.
describe('calculerFire', () => {
  it('patrimoine nécessaire = dépense / taux de retrait (règle des 4 %)', () => {
    const resultat = calculerFire(0, 0, 0, 40000, 4)
    expect(resultat.patrimoineNecessaire).toBeCloseTo(1_000_000, 6)
  })

  it('déjà indépendant : 0 année, patrimoine nécessaire inchangé', () => {
    const resultat = calculerFire(1_500_000, 5, 0, 40000, 4)
    expect(resultat.patrimoineNecessaire).toBeCloseTo(1_000_000, 6)
    expect(resultat.anneesAvantIndependance).toBe(0)
  })

  it('sans rendement, 10 000€/mois pour 1 000 000€ : exactement 100 mois ≈ 8,3 ans', () => {
    const resultat = calculerFire(0, 0, 10000, 40000, 4)
    expect(resultat.anneesAvantIndependance).toBeCloseTo(8.3, 6)
  })

  it("non atteint dans l'horizon de 60 ans sans rendement ni versement : null", () => {
    const resultat = calculerFire(0, 0, 0, 1_000_000, 4)
    expect(resultat.anneesAvantIndependance).toBeNull()
  })

  it('un taux de retrait plus bas exige un patrimoine plus important', () => {
    const resultat4 = calculerFire(0, 5, 0, 40000, 4)
    const resultat3 = calculerFire(0, 5, 0, 40000, 3)
    expect(resultat3.patrimoineNecessaire).toBeGreaterThan(resultat4.patrimoineNecessaire)
  })
})
