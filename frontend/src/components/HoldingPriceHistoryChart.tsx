import { useEffect, useState } from 'react'
import { Line, LineChart, Tooltip, XAxis, YAxis } from 'recharts'
import { api } from '../api/client'
import type { HoldingPriceHistoryResponse } from '../api/types'
import Card from './Card'
import { SkeletonGraphique } from './Skeleton'
import EtatVide from './EtatVide'
import EtatErreur from './EtatErreur'
import { usePreferencesAffichage } from '../hooks/usePreferencesAffichage'
import { formatDate, formatEuro } from '../utils/format'
import { ChartFrame, reperesTemporels } from './ChartFrame'
import { STYLE_INFOBULLE, TRAIT_PRINCIPAL } from '../utils/chartTheme'

export default function HoldingPriceHistoryChart({ ticker }: { ticker: string }) {
  const { montantsMasques } = usePreferencesAffichage()
  const [data, setData] = useState<HoldingPriceHistoryResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  function charger() {
    setData(null)
    setLoading(true)
    setError(null)
    api
      .getHoldingPriceHistory(ticker)
      .then(setData)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(charger, [ticker])

  if (loading) {
    return (
      <Card title="Performance historique">
        <SkeletonGraphique hauteur={240} />
      </Card>
    )
  }

  // Erreur réseau (backlog 2.K.5) distincte d'une absence légitime de données —
  // avant, les deux étaient confondues dans le même repli `EtatVide` ci-dessous.
  if (error) {
    return (
      <Card title="Performance historique">
        <EtatErreur message={error} onReessayer={charger} />
      </Card>
    )
  }

  if (!data || data.points.length === 0) {
    return (
      <Card title="Performance historique">
        <EtatVide titre="Historique de cours non disponible pour ce titre." />
      </Card>
    )
  }

  return (
    <Card title="Performance historique">
      <ChartFrame reperes={reperesTemporels(data.points.map((p) => ({ date: p.date })), 'date', formatDate)} hauteur="panneau">
        <LineChart data={data.points} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
          <XAxis dataKey="date" hide />
          <YAxis hide domain={['dataMin', 'dataMax']} />
          <Tooltip
            formatter={(value) => formatEuro(Number(value), 2, montantsMasques)}
            labelFormatter={(date) => formatDate(String(date))}
            {...STYLE_INFOBULLE}
          />
          <Line
            type="monotone"
            dataKey="prix"
            stroke="var(--accent)"
            dot={false}
            strokeWidth={TRAIT_PRINCIPAL}
            isAnimationActive={false}
          />
        </LineChart>
      </ChartFrame>

      <div className="mt-3 flex gap-6 border-t border-bordure pt-3 text-sm">
        <div>
          <p className="text-xs text-texte-attenue">Volatilité annualisée</p>
          <p className="font-medium text-texte">
            {data.volatilite_annualisee_pct !== null ? `${data.volatilite_annualisee_pct.toFixed(1)}%` : '—'}
          </p>
        </div>
        <div>
          <p className="text-xs text-texte-attenue">Perte maximale historique (drawdown)</p>
          <p className="font-medium text-negatif">{data.max_drawdown_pct !== null ? `${data.max_drawdown_pct.toFixed(1)}%` : '—'}</p>
        </div>
      </div>
    </Card>
  )
}
