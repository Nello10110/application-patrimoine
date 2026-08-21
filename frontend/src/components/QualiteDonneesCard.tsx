import type { QualiteDonnees } from '../api/types'
import Card from './Card'
import { usePreferencesAffichage } from '../hooks/usePreferencesAffichage'
import { formatEuro } from '../utils/format'

/** Encart de qualité des données (LOT 2.1/2.3) : la comparaison réel vs cible du
 * tableau de bord n'a de sens que si l'utilisateur sait à quel point le "réel" est
 * mesuré plutôt qu'estimé — voire pas connu du tout. N'affiche rien tant qu'il n'y a
 * rien à signaler (portefeuille entièrement couvert par une composition réelle et
 * coté). */
export default function QualiteDonneesCard({ qualite }: { qualite: QualiteDonnees }) {
  const { montantsMasques } = usePreferencesAffichage()
  const lignes: string[] = []

  if (qualite.pct_estimee_par_indice > 0) {
    lignes.push(
      `${qualite.pct_estimee_par_indice}% de la valeur du portefeuille (${formatEuro(qualite.valeur_estimee_par_indice, 0, montantsMasques)}) a une répartition géographique estimée à partir de l'indice suivi par le fonds, faute de composition détaillée disponible.`,
    )
  }

  if (qualite.pct_non_categorisee > 0) {
    lignes.push(
      `${qualite.pct_non_categorisee}% de la valeur du portefeuille (${formatEuro(qualite.valeur_non_categorisee, 0, montantsMasques)}) n'a aucune donnée géographique disponible et apparaît en "Non catégorisé".`,
    )
  }

  if (qualite.valeur_sans_cotation > 0) {
    lignes.push(
      `${formatEuro(qualite.valeur_sans_cotation, 0, montantsMasques)} (${qualite.pct_sans_cotation}%) sont valorisés à leur coût de revient faute de cotation disponible — cette valeur entre telle quelle dans le score de diversification et dans les montants de rééquilibrage en euros.`,
    )
  }

  if (lignes.length === 0) return null

  // Bandeau d'alerte à fond teinté (backlog 2.K.1) : volontairement hors des 9
  // jetons sémantiques, comme la palette catégorielle d'AidePage — `avertissement`
  // n'est qu'une couleur scalaire (texte/bordure fine), pas un jeton de fond teinté
  // à plusieurs nuances avec opacité ; en introduire un pour ce seul usage aurait
  // été prématuré (aucun autre bandeau de ce type dans l'application aujourd'hui).
  return (
    <Card className="border-amber-200 bg-amber-50 dark:border-amber-400/30 dark:bg-amber-950/40">
      <p className="mb-2 text-sm font-semibold text-amber-900 dark:text-amber-300">Qualité des données</p>
      <ul className="space-y-1.5">
        {lignes.map((ligne) => (
          <li key={ligne} className="text-sm text-amber-800 dark:text-amber-200/90">
            {ligne}
          </li>
        ))}
      </ul>
    </Card>
  )
}
