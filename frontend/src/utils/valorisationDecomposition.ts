export type ModeDecomposition = 'versement' | 'plus_value'

/** Le versement et la plus-value d'un point d'historique sont les deux faces de la
 * même somme (`valeur - valeurPrécédente`, backlog § U.2) : connaître l'une donne
 * l'autre par soustraction. Un seul champ est jamais stocké (`versement`, sur
 * `HoldingValuationHistory`) — cette fonction traduit la saisie de l'utilisateur
 * (quel que soit le champ qu'il a choisi de remplir) vers cette seule donnée. */
export function versementDepuisDecomposition(
  mode: ModeDecomposition,
  montant: string,
  valeur: string,
  valeurPrecedente: number | null,
): number | null {
  if (!montant) return null
  if (mode === 'versement') return Number(montant)
  if (valeurPrecedente === null || !valeur) return null
  return Number(valeur) - valeurPrecedente - Number(montant)
}
