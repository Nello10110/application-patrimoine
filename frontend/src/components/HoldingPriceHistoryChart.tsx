import { useEffect, useState } from 'react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { api } from '../api/client'
import type { HoldingPriceHistoryResponse } from '../api/types'
import Card from './Card'
import { usePreferencesAffichage } from '../hooks/usePreferencesAffichage'
import { formatEuro } from '../utils/format'
import { COULEUR_AXE, COULEUR_GRILLE, STYLE_INFOBULLE, STYLE_TICK_AXE } from '../utils/chartTheme'

export default function HoldingPriceHistoryChart({ ticker }: { ticker: string }) {
  const { montantsMasques } = usePreferencesAffichage()
  const [data, setData] = useState<HoldingPriceHistoryResponse | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setData(null)
    setLoading(true)
    api
      .getHoldingPriceHistory(ticker)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [ticker])

  if (loading) {
    return (
      <Card title="Performance historique">
        <p className="text-sm text-slate-500 dark:text-slate-400">Chargement de l'historique de cours...</p>
      </Card>
    )
  }

  if (!data || data.points.length === 0) {
    return (
      <Card title="Performance historique">
        <p className="text-sm text-slate-500 dark:text-slate-400">Historique de cours non disponible pour ce titre.</p>
      </Card>
    )
  }

  return (
    <Card title="Performance historique">
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={data.points}>
          <CartesianGrid strokeDasharray="3 3" stroke={COULEUR_GRILLE} />
          <XAxis dataKey="date" tick={{ fontSize: 11, ...STYLE_TICK_AXE }} minTickGap={40} stroke={COULEUR_AXE} />
          <YAxis
            tickFormatter={(v) => formatEuro(Number(v), 2, montantsMasques)}
            width={80}
            tick={{ fontSize: 11, ...STYLE_TICK_AXE }}
            domain={['auto', 'auto']}
            stroke={COULEUR_AXE}
          />
          <Tooltip formatter={(value) => formatEuro(Number(value), 2, montantsMasques)} {...STYLE_INFOBULLE} />
          <Line type="monotone" dataKey="prix" stroke="#2563eb" dot={false} strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>

      <div className="mt-3 flex gap-6 border-t border-slate-100 pt-3 text-sm dark:border-slate-700">
        <div>
          <p className="text-xs text-slate-500 dark:text-slate-400">Volatilité annualisée</p>
          <p className="font-medium text-slate-900 dark:text-slate-100">
            {data.volatilite_annualisee_pct !== null ? `${data.volatilite_annualisee_pct.toFixed(1)}%` : '—'}
          </p>
        </div>
        <div>
          <p className="text-xs text-slate-500 dark:text-slate-400">Perte maximale historique (drawdown)</p>
          <p className="font-medium text-red-600 dark:text-red-400">
            {data.max_drawdown_pct !== null ? `${data.max_drawdown_pct.toFixed(1)}%` : '—'}
          </p>
        </div>
      </div>
    </Card>
  )
}
