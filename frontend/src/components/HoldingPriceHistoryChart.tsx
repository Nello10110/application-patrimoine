import { useEffect, useState } from 'react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { api } from '../api/client'
import type { HoldingPriceHistoryResponse } from '../api/types'
import Card from './Card'
import { SkeletonGraphique } from './Skeleton'
import EtatVide from './EtatVide'
import EtatErreur from './EtatErreur'
import { usePreferencesAffichage } from '../hooks/usePreferencesAffichage'
import { formatEuro } from '../utils/format'
import { COULEUR_AXE, COULEUR_GRILLE, STYLE_INFOBULLE, STYLE_TICK_AXE } from '../utils/chartTheme'

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
