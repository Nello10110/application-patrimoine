/** Intérêts composés MENSUELS + versement mensuel constant — même formule que
 * `simulation_service.compute_projection` côté backend (Phase 2), mais calculée ici
 * côté client : le calculateur de la page Outils est un outil générique, indépendant
 * du patrimoine suivi par l'application (pas de patrimoine de départ imposé), donc
 * sans raison de passer par le backend pour un calcul aussi simple et sans donnée
 * personnelle. */

export interface PointTrajectoire {
  annee: number
  valeur: number
  investi: number
}

export function calculerTrajectoire(
  capitalInitial: number,
  tauxAnnuelPct: number,
  versementMensuel: number,
  annees: number,
): PointTrajectoire[] {
  const tauxMensuel = tauxAnnuelPct / 100 / 12
  let valeur = capitalInitial
  let verse = capitalInitial
  const points: PointTrajectoire[] = [{ annee: 0, valeur: arrondi(valeur), investi: arrondi(verse) }]
  for (let annee = 1; annee <= annees; annee++) {
    for (let mois = 0; mois < 12; mois++) {
      valeur = valeur * (1 + tauxMensuel) + versementMensuel
      verse += versementMensuel
    }
    points.push({ annee, valeur: arrondi(valeur), investi: arrondi(verse) })
  }
  return points
}

export function arrondi(n: number): number {
  return Math.round(n * 100) / 100
}
