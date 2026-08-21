import { useEffect, useMemo, useState } from 'react'
import { Area, AreaChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { api } from '../api/client'
import type { PortfolioHistoryPoint } from '../api/types'
import Card from './Card'
import { usePreferencesAffichage } from '../hooks/usePreferencesAffichage'
import { formatEuro } from '../utils/format'
import { COULEUR_AXE, COULEUR_GRILLE, STYLE_INFOBULLE, STYLE_TICK_AXE } from '../utils/chartTheme'

type Range = '1y' | '5y' | 'all'

export default function PortfolioHistoryChart() {
  const { montantsMasques } = usePreferencesAffichage()
  const [points, setPoints] = useState<PortfolioHistoryPoint[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [range, setRange] = useState<Range>('all')
  const [stacked, setStacked] = useState(false)

  useEffect(() => {
    api
      .getPortfolioHistory()
      .then((res) => setPoints(res.points))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  const filtered = useMemo(() => {
    if (!points) return []
    if (range === 'all') return points
    const years = range === '1y' ? 1 : 5
    const cutoff = new Date()
    cutoff.setFullYear(cutoff.getFullYear() - years)
    const cutoffStr = cutoff.toISOString().slice(0, 10)
    return points.filter((p) => p.date >= cutoffStr)
  }, [points, range])

  const data = useMemo(
    () =>
      filtered.map((p) => ({
        date: p.date,
        Portefeuille: p.valeur_portefeuille,
        Investi: p.valeur_investie,
        // Inclut le produit des ventes réalisées + dividendes + intérêts perçus, pas
        // seulement la valeur de marché actuelle — sans quoi ce total ne recoupait pas
        // celui de la carte Rentabilité globale (cf. `valeur_realisee_cumulee`, backend).
        Gains: p.valeur_portefeuille + p.valeur_realisee_cumulee - p.valeur_investie,
      })),
    [filtered],
  )

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Évolution du portefeuille</h2>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex gap-1">
            {(['1y', '5y', 'all'] as Range[]).map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  range === r
                    ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600'
                }`}
              >
                {r === '1y' ? '1 an' : r === '5y' ? '5 ans' : 'Depuis le début'}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
            <input type="checkbox" checked={stacked} onChange={(e) => setStacked(e.target.checked)} />
            Mode étagé (investi + gains)
          </label>
        </div>
      </div>

      {stacked && (
        <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">
          « Gains » inclut les ventes réalisées, dividendes et intérêts perçus — même chiffre que le
          Gain/Perte total de la carte Rentabilité globale.
        </p>
      )}

      {loading && (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Calcul de l'historique en cours (peut prendre jusqu'à une minute, une seule fois)...
        </p>
      )}
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      {!loading && !error && data.length === 0 && (
        <p className="text-sm text-slate-500 dark:text-slate-400">Pas encore d'historique disponible.</p>
      )}

      {!loading && !error && data.length > 0 && (
        <ResponsiveContainer width="100%" height={280}>
          {stacked ? (
            <AreaChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke={COULEUR_GRILLE} />
              <XAxis dataKey="date" tick={{ fontSize: 11, ...STYLE_TICK_AXE }} minTickGap={40} stroke={COULEUR_AXE} />
              <YAxis tickFormatter={(v) => formatEuro(Number(v), 0, montantsMasques)} width={80} tick={{ fontSize: 11, ...STYLE_TICK_AXE }} stroke={COULEUR_AXE} />
              <Tooltip formatter={(value) => formatEuro(Number(value), 0, montantsMasques)} {...STYLE_INFOBULLE} />
              <Area type="monotone" dataKey="Investi" stackId="1" stroke="#94a3b8" fill="#cbd5e1" />
              <Area type="monotone" dataKey="Gains" stackId="1" stroke="#16a34a" fill="#86efac" />
            </AreaChart>
          ) : (
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke={COULEUR_GRILLE} />
              <XAxis dataKey="date" tick={{ fontSize: 11, ...STYLE_TICK_AXE }} minTickGap={40} stroke={COULEUR_AXE} />
              <YAxis tickFormatter={(v) => formatEuro(Number(v), 0, montantsMasques)} width={80} tick={{ fontSize: 11, ...STYLE_TICK_AXE }} stroke={COULEUR_AXE} />
              <Tooltip formatter={(value) => formatEuro(Number(value), 0, montantsMasques)} {...STYLE_INFOBULLE} />
              <Line type="monotone" dataKey="Portefeuille" stroke="#2563eb" dot={false} strokeWidth={2} />
            </LineChart>
          )}
        </ResponsiveContainer>
      )}
    </Card>
  )
}
