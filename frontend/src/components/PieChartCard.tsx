import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import type { RepartitionItem } from '../api/types'
import Card from './Card'
import { STYLE_INFOBULLE } from '../utils/chartTheme'

const COLORS = ['#2563eb', '#7c3aed', '#0891b2', '#16a34a', '#ca8a04', '#dc2626', '#db2777', '#4b5563', '#0d9488', '#9333ea', '#ea580c']

export default function PieChartCard({ title, items }: { title: string; items: RepartitionItem[] }) {
  if (items.length === 0) {
    return (
      <Card title={title}>
        <p className="text-sm text-texte-attenue">Titre unique, pas de décomposition interne.</p>
      </Card>
    )
  }

  const data = items.map((i) => ({ name: i.categorie, value: i.poids * 100 }))

  return (
    <Card title={title}>
      <ResponsiveContainer width="100%" height={320}>
        <PieChart margin={{ top: 10, right: 30, bottom: 10, left: 30 }}>
          <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="45%" outerRadius={70} label={(d) => `${d.value.toFixed(0)}%`}>
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
