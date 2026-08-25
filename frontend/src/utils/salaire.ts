/** Conversion brut/net approximative pour l'aperçu instantané côté client (calculateur
 * de salaire, écran `/salaire`) — mêmes coefficients que `backend/app/services/salaire_service.py`
 * (dupliqués volontairement, aucun code partagé entre les deux côtés de ce projet).
 * Cotisations salariales secteur privé, forfaitaires : jamais un calcul de paie certifié. */

export const COEFFICIENT_NET_SUR_BRUT: Record<'cadre' | 'non_cadre', number> = {
  cadre: 0.75,
  non_cadre: 0.78,
}

export function estimerBrutNet(
  montant: number,
  typeMontant: 'brut' | 'net',
  statut: 'cadre' | 'non_cadre',
): { brut: number; net: number } {
  const coefficient = COEFFICIENT_NET_SUR_BRUT[statut]
  if (typeMontant === 'brut') {
    return { brut: montant, net: montant * coefficient }
  }
  return { brut: montant / coefficient, net: montant }
}
