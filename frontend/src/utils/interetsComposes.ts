/** Intérêts composés MENSUELS + versement mensuel constant, moteur commun à la page
 * Simulateur (projection, tableau de détail, indépendance financière). Calculé
 * entièrement côté client — jusqu'à l'increment qui a fusionné Simulateur et
 * Outils, cette même formule vivait aussi côté backend
 * (`simulation_service.compute_projection`/`compute_fire`, roadmap Phase 2) : elle
 * n'y était utilisée que pour projeter le patrimoine net réel de l'utilisateur,
 * jamais un capital de départ personnalisé (endpoints non paramétrables sur ce
 * point). Plutôt que maintenir deux moteurs identiques en parallèle, le patrimoine
 * net réel est désormais simplement lu une fois (`GET /api/patrimoine/net`, déjà
 * utilisé ailleurs) pour préremplir le capital de départ, et tout le calcul qui en
 * découle (projection, tableau, FIRE) passe par ce module, testé indépendamment des
 * mêmes références fermées que l'ancien module backend.
 *
 * Convention de capitalisation : les intérêts d'un mois se calculent sur le capital
 * AVANT le versement de ce mois-là (`capital × taux mensuel`), puis le versement
 * s'ajoute — un versement ne produit donc son premier intérêt qu'au mois suivant. */

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

export interface ResultatFire {
  patrimoineNecessaire: number
  // Délai estimé en années (1 décimale), 0 si déjà atteint, `null` si non atteint
  // dans l'horizon de recherche (60 ans) — jamais un nombre au-delà, qui laisserait
  // croire à une précision que le calcul n'a pas sur un horizon aussi lointain.
  anneesAvantIndependance: number | null
}

const HORIZON_MAX_ANNEES = 60

/** Indépendance financière (FIRE) : patrimoine nécessaire (`dépense annuelle
 * cible / taux de retrait`) et délai estimé pour l'atteindre avec les mêmes
 * hypothèses de rendement/versement que la projection — même moteur mensuel que
 * `calculerTrajectoireMensuelle`, juste arrêté dès que le seuil est franchi plutôt
 * que poursuivi jusqu'à l'horizon demandé. */
export function calculerFire(
  capitalInitial: number,
  tauxAnnuelPct: number,
  versementMensuel: number,
  depenseAnnuelleCible: number,
  tauxRetraitPct: number,
): ResultatFire {
  const patrimoineNecessaire = arrondi(depenseAnnuelleCible / (tauxRetraitPct / 100))

  if (capitalInitial >= patrimoineNecessaire) {
    return { patrimoineNecessaire, anneesAvantIndependance: 0 }
  }

  const tauxMensuel = tauxAnnuelPct / 100 / 12
  let valeur = capitalInitial
  for (let mois = 1; mois <= HORIZON_MAX_ANNEES * 12; mois++) {
    valeur = valeur * (1 + tauxMensuel) + versementMensuel
    if (valeur >= patrimoineNecessaire) {
      return { patrimoineNecessaire, anneesAvantIndependance: Math.round((mois / 12) * 10) / 10 }
    }
  }
  return { patrimoineNecessaire, anneesAvantIndependance: null }
}

export function arrondi(n: number): number {
  return Math.round(n * 100) / 100
}
