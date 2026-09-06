import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import type { RepartitionItem } from '../api/types'
import Card from './Card'
import EtatVide from './EtatVide'
import { SERIE, STYLE_INFOBULLE } from '../utils/chartTheme'

// Une seule famille de bleus, du plus au moins important (refonte « liquid glass ») :
// la palette arc-en-ciel d'avant faisait croire à des catégories de natures
// différentes là où il n'y a qu'un ordre de grandeur. Au-delà de la cinquième, la
// teinte ne distingue plus rien — c'est le libellé qui le fait.
const COLORS = SERIE

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

  const data = items.map((i) => ({ name: i.categorie, value: i.poids * 100 }))

  return (
    <Card title={title}>
      <ResponsiveContainer width="100%" height={320}>
        <PieChart margin={{ top: 10, right: 30, bottom: 10, left: 30 }}>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="45%"
            outerRadius={70}
            label={(d) => `${d.value.toFixed(0)}%`}
            cursor={onCategoryClick ? 'pointer' : undefined}
            onClick={(d) => onCategoryClick?.((d as unknown as { name: string }).name)}
          >
            {data.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip formatter={(value) => `${Number(value).toFixed(1)}%`} {...STYLE_INFOBULLE} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
        </PieChart>
      </ResponsiveContainer>
    </Card>
  )
}
