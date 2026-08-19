import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { AllocationBreakdownItem } from '../api/types'
import { COULEUR_AXE, COULEUR_GRILLE, STYLE_INFOBULLE, STYLE_TICK_AXE } from '../utils/chartTheme'

export default function AllocationBarChart({
  items,
  onCategoryClick,
}: {
  items: AllocationBreakdownItem[]
  onCategoryClick?: (categorie: string) => void
}) {
  const data = items.map((item) => ({
    categorie: item.categorie,
    Réel: item.pourcentage_reel,
    Cible: item.pourcentage_cible ?? 0,
  }))

  const height = Math.max(220, data.length * 44)

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ left: 24, right: 24 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={COULEUR_GRILLE} />
        <XAxis type="number" unit="%" domain={[0, 'dataMax']} stroke={COULEUR_AXE} tick={STYLE_TICK_AXE} />
        <YAxis type="category" dataKey="categorie" width={200} tick={{ fontSize: 12, ...STYLE_TICK_AXE }} stroke={COULEUR_AXE} />
        <Tooltip formatter={(value) => `${Number(value).toFixed(1)}%`} {...STYLE_INFOBULLE} />
        <Legend />
        <Bar
          dataKey="Réel"
          fill="#2563eb"
          radius={[0, 4, 4, 0]}
          cursor={onCategoryClick ? 'pointer' : undefined}
          onClick={(d) => onCategoryClick?.((d as unknown as { payload: { categorie: string } }).payload.categorie)}
        />
        <Bar
          dataKey="Cible"
          fill="#94a3b8"
          radius={[0, 4, 4, 0]}
          cursor={onCategoryClick ? 'pointer' : undefined}
          onClick={(d) => onCategoryClick?.((d as unknown as { payload: { categorie: string } }).payload.categorie)}
        />
      </BarChart>
    </ResponsiveContainer>
  )
}
