import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import type { AllocationBreakdownItem } from '../api/types'
import { SERIE, STYLE_INFOBULLE } from '../utils/chartTheme'

// Une seule famille de bleus, du plus au moins important (refonte « liquid glass ») :
// la palette arc-en-ciel d'avant faisait croire à des catégories de natures
// différentes là où il n'y a qu'un ordre de grandeur. Au-delà de la cinquième, la
// teinte ne distingue plus rien — c'est le libellé qui le fait.
const COLORS = SERIE

/** Variante camembert d'`AllocationBarChart` (LOT 6.10) : répartition réelle
 * (`pourcentage_reel`) du portefeuille financier. */
export default function AllocationPieChart({
  items,
  onCategoryClick,
  height = 320,
}: {
  items: AllocationBreakdownItem[]
  onCategoryClick?: (categorie: string) => void
  height?: number
}) {
  const data = items.map((item) => ({ name: item.categorie, value: item.pourcentage_reel }))

  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart margin={{ top: 10, right: 30, bottom: 10, left: 30 }}>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="45%"
          outerRadius={Math.min(100, height / 2 - 60)}
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
  )
}
