import { useEffect, useState } from 'react'
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { api } from '../api/client'
import type { CategoryCompositionResponse } from '../api/types'
import HoldingDetailModal from './HoldingDetailModal'
import Modale from './Modale'
import { usePreferencesAffichage } from '../hooks/usePreferencesAffichage'
import { formatEuro } from '../utils/format'
import { STYLE_INFOBULLE } from '../utils/chartTheme'

const COLORS = ['#2563eb', '#7c3aed', '#0891b2', '#16a34a', '#ca8a04', '#dc2626', '#db2777', '#4b5563', '#0d9488', '#9333ea', '#ea580c']

export default function CompositionModal({
  type,
  categorie,
  onClose,
}: {
  type: 'geo' | 'sector'
  categorie: string
  onClose: () => void
}) {
  const { montantsMasques } = usePreferencesAffichage()
  const [data, setData] = useState<CategoryCompositionResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    api
      .getCategoryComposition(type, categorie)
      .then(setData)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [type, categorie])

  return (
    <>
      <Modale onClose={onClose} panelClassName="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
        {({ titleId }) => (
          <>
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h3 id={titleId} className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  {categorie}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {type === 'geo' ? 'Répartition géographique' : 'Répartition sectorielle'}
                </p>
              </div>
              <button
                onClick={onClose}
                aria-label="Fermer"
                className="text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
              >
                ✕
              </button>
            </div>

            {loading && <p className="text-sm text-slate-500 dark:text-slate-400">Chargement...</p>}
            {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

            {data && data.lignes.length === 0 && (
              <p className="text-sm text-slate-500 dark:text-slate-400">Aucune ligne ne compose cette catégorie.</p>
            )}

            {data && data.lignes.length > 0 && (
              <>
                <p className="mb-2 text-sm text-slate-600 dark:text-slate-300">
                  Valeur totale :{' '}
                  <span className="font-medium text-slate-900 dark:text-slate-100">{formatEuro(data.valeur_totale, 2, montantsMasques)}</span>
                </p>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart margin={{ top: 10, right: 30, bottom: 10, left: 30 }}>
                    <Pie
                      data={data.lignes}
                      dataKey="valeur"
                      nameKey="ticker"
                      cx="50%"
                      cy="45%"
                      outerRadius={70}
                      label={(d) => `${((d.value / data.valeur_totale) * 100).toFixed(0)}%`}
                    >
                      {data.lignes.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => formatEuro(Number(value), 2, montantsMasques)} {...STYLE_INFOBULLE} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>

                <ul className="mt-3 divide-y divide-slate-100 border-t border-slate-100 dark:divide-slate-700 dark:border-slate-700">
                  {data.lignes.map((l) => (
                    <li key={l.ticker}>
                      <button
                        type="button"
                        onClick={() => setSelectedTicker(l.ticker)}
                        className="flex w-full items-center justify-between py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-700/50"
                      >
                        <span className="text-slate-700 dark:text-slate-300">{l.nom ?? l.ticker}</span>
                        <span className="font-medium text-slate-900 dark:text-slate-100">{formatEuro(l.valeur, 2, montantsMasques)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </Modale>

      {selectedTicker && <HoldingDetailModal ticker={selectedTicker} onClose={() => setSelectedTicker(null)} />}
    </>
  )
}
