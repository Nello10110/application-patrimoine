import type { Holding } from '../api/types'

export interface LigneGainCompte {
  compteId: number
  compteNom: string
  valeur: number
  gain: number
  gainPct: number | null
  rendementAnnualise: number | null
}

/** Un seul compte peut regrouper des lignes sans prix de revient connu (compte
 * courant, livret non côté...) : elles n'entrent dans aucune somme, jamais
 * comptées comme un "gain nul" qui laisserait croire à une performance mesurée là
 * où il n'y a simplement rien à comparer. Un compte n'apparaît ici que s'il porte
 * au moins une ligne avec un prix de revient — cohérent avec `Holding.valeur`
 * (`analysis_service.value_holdings` côté backend), déjà calculée pour chaque ligne. */
export function calculerGainsParCompte(holdings: Holding[]): LigneGainCompte[] {
  const parCompte = new Map<
    number,
    { nom: string; valeur: number; cout: number; sommeValeurPonderee: number; sommeValeurAvecRendement: number }
  >()
  for (const h of holdings) {
    if (!h.compte || h.prix_revient_moyen === null) continue
    const valeur = h.valeur ?? 0
    const cout = h.prix_revient_moyen * h.quantite
    const entree = parCompte.get(h.compte.id) ?? {
      nom: h.compte.nom,
      valeur: 0,
      cout: 0,
      sommeValeurPonderee: 0,
      sommeValeurAvecRendement: 0,
    }
    entree.valeur += valeur
    entree.cout += cout
    if (h.rendement_annualise_pct !== null) {
      entree.sommeValeurPonderee += valeur * h.rendement_annualise_pct
      entree.sommeValeurAvecRendement += valeur
    }
    parCompte.set(h.compte.id, entree)
  }
  return Array.from(parCompte.entries())
    .map(([compteId, e]) => ({
      compteId,
      compteNom: e.nom,
      valeur: e.valeur,
      gain: e.valeur - e.cout,
      gainPct: e.cout > 0 ? ((e.valeur - e.cout) / e.cout) * 100 : null,
      rendementAnnualise: e.sommeValeurAvecRendement > 0 ? e.sommeValeurPonderee / e.sommeValeurAvecRendement : null,
    }))
    .sort((a, b) => b.gain - a.gain)
}
