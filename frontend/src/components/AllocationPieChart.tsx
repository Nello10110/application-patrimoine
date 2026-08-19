import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import type { AllocationBreakdownItem } from '../api/types'
import { STYLE_INFOBULLE } from '../utils/chartTheme'

const COLORS = ['#2563eb', '#7c3aed', '#0891b2', '#16a34a', '#ca8a04', '#dc2626', '#db2777', '#4b5563', '#0d9488', '#9333ea', '#ea580c']

/** Variante camembert d'`AllocationBarChart` (LOT 6.10) : ne montre que la répartition
 * réelle (`pourcentage_reel`), volontairement — un camembert à deux séries (réel +
 * cible) n'est pas lisible, contrairement aux barres. La comparaison à la cible reste
 * disponible en repassant sur le mode barres. */
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
