/** Intérêts composés MENSUELS + versement mensuel constant — même formule que
 * `simulation_service.compute_projection` côté backend (Phase 2), mais calculée ici
 * côté client : le calculateur de la page Outils est un outil générique, indépendant
 * du patrimoine suivi par l'application (pas de patrimoine de départ imposé), donc
 * sans raison de passer par le backend pour un calcul aussi simple et sans donnée
 * personnelle.
 *
 * Convention de capitalisation : les intérêts d'un mois se calculent sur le capital
 * AVANT le versement de ce mois-là (`capital × taux mensuel`), puis le versement
 * s'ajoute — un versement ne produit donc son premier intérêt qu'au mois suivant.
 * C'est la même convention que la boucle `compute_projection` côté backend
 * (`valeur = valeur * (1 + taux) + épargne`), reproduite ici à la maille du mois
 * plutôt que seulement à la maille de l'année. */

export interface PointTrajectoire {
  annee: number
  valeur: number
  investi: number
}

/** Une ligne par mois écoulé (mois 0 = état initial, avant tout intérêt). */
export interface PointMensuel {
  moisIndex: number
  annee: number
  moisDeLAnnee: number // 1-12 ; 0 pour la ligne d'état initial
  versement: number
  interets: number
  capital: number
  verseCumule: number
  interetsCumules: number
}

/** Une ligne par année (année 0 = état initial). `versements`/`interets` sont des
 * SOMMES sur l'année (pas des valeurs de fin de mois) ; `capital`/`verseCumule`/
 * `interetsCumules` restent des valeurs de fin d'année (ou de l'état initial). */
export interface PointAnnuel {
  annee: number
  versements: number
  interets: number
  capital: number
  verseCumule: number
  interetsCumules: number
}

export function calculerTrajectoireMensuelle(
  capitalInitial: number,
  tauxAnnuelPct: number,
  versementMensuel: number,
  annees: number,
): PointMensuel[] {
  const tauxMensuel = tauxAnnuelPct / 100 / 12
  let valeur = capitalInitial
  let verseCumule = capitalInitial
  const points: PointMensuel[] = [
    { moisIndex: 0, annee: 0, moisDeLAnnee: 0, versement: capitalInitial, interets: 0, capital: arrondi(valeur), verseCumule: arrondi(verseCumule), interetsCumules: 0 },
  ]

  let moisIndex = 0
  for (let annee = 1; annee <= annees; annee++) {
    for (let moisDeLAnnee = 1; moisDeLAnnee <= 12; moisDeLAnnee++) {
      moisIndex++
      const interets = valeur * tauxMensuel
      valeur = valeur + interets + versementMensuel
      verseCumule += versementMensuel
      points.push({
        moisIndex,
        annee,
        moisDeLAnnee,
        versement: arrondi(versementMensuel),
        interets: arrondi(interets),
        capital: arrondi(valeur),
        verseCumule: arrondi(verseCumule),
        interetsCumules: arrondi(valeur - verseCumule),
      })
    }
  }
  return points
}

/** Un point par ANNÉE (fin d'année), dérivé de la trajectoire mensuelle pour
 * n'avoir qu'une seule formule de capitalisation à maintenir — le graphique et le
 * tableau annuel restent ainsi rigoureusement cohérents entre eux. */
export function calculerTrajectoire(capitalInitial: number, tauxAnnuelPct: number, versementMensuel: number, annees: number): PointTrajectoire[] {
  const mensuel = calculerTrajectoireMensuelle(capitalInitial, tauxAnnuelPct, versementMensuel, annees)
  return mensuel.filter((p) => p.moisDeLAnnee === 12 || p.annee === 0).map((p) => ({ annee: p.annee, valeur: p.capital, investi: p.verseCumule }))
}

/** Agrège une trajectoire mensuelle en une ligne par année (versements/intérêts
 * SOMMÉS sur l'année, capital/cumuls arrêtés en fin d'année). Les mois d'une même
 * année arrivent dans l'ordre depuis `calculerTrajectoireMensuelle` : la dernière
 * écriture de `capital`/`verseCumule`/`interetsCumules` pour une année correspond
 * donc bien à son mois 12. */
export function agregerParAnnee(pointsMensuels: PointMensuel[]): PointAnnuel[] {
  const parAnnee = new Map<number, PointAnnuel>()
  for (const p of pointsMensuels) {
    if (p.annee === 0) {
      parAnnee.set(0, { annee: 0, versements: p.versement, interets: 0, capital: p.capital, verseCumule: p.verseCumule, interetsCumules: 0 })
      continue
    }
    const existant = parAnnee.get(p.annee) ?? { annee: p.annee, versements: 0, interets: 0, capital: 0, verseCumule: 0, interetsCumules: 0 }
    parAnnee.set(p.annee, {
      annee: p.annee,
      versements: arrondi(existant.versements + p.versement),
      interets: arrondi(existant.interets + p.interets),
      capital: p.capital,
      verseCumule: p.verseCumule,
      interetsCumules: p.interetsCumules,
    })
  }
  return Array.from(parAnnee.values())
}

export function arrondi(n: number): number {
  return Math.round(n * 100) / 100
}
