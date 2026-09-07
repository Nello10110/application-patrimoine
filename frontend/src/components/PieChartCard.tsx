import type { RepartitionItem } from '../api/types'
import Card from './Card'
import { RepartitionEmpilee } from './ChartFrame'
import EtatVide from './EtatVide'

/** Répartition d'une composition (géographie/secteur d'un fonds).
 *
 * Le camembert a disparu (passe d'uniformité) : la première décision structurelle de
 * la refonte était « un seul langage graphique, plus de camembert doublé d'une liste
 * qui répète les mêmes chiffres ». `AllocationChartCard` l'avait appliquée en
 * retirant sa bascule ; ce composant y avait échappé, avec en prime des étiquettes de
 * pourcentage posées sur des parts de 3 %.
 *
 * La barre empilée + liste reste lisible au-delà de cinq parts, là où un camembert
 * devient un anneau de miettes — et elle ne demande aucun Recharts : c'est du HTML. */
export default function PieChartCard({
  title,
  items,
  onCategoryClick,
}: {
  title: string
  items: RepartitionItem[]
  onCategoryClick?: (categorie: string) => void
}) {
  if (items.length === 0) {
    return (
      <Card title={title}>
        <EtatVide titre="Titre unique, pas de décomposition interne." />
      </Card>
    )
  }

  // Triées du plus grand au plus petit : la famille `--s1`…`--s5` code un ORDRE de
  // grandeur, elle ne veut rien dire sur une liste non ordonnée.
  const parts = [...items]
    .sort((a, b) => b.poids - a.poids)
    .map((i) => ({ nom: i.categorie, pourcentage: i.poids * 100 }))

  return (
    <Card title={title}>
      <RepartitionEmpilee parts={parts} onPartClick={onCategoryClick} />
    </Card>
  )
}
