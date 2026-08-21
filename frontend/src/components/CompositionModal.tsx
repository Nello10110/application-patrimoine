import { useEffect, useState } from 'react'
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { api } from '../api/client'
import type { CategoryCompositionResponse } from '../api/types'
import EtatErreur from './EtatErreur'
import EtatVide from './EtatVide'
import HoldingDetailModal from './HoldingDetailModal'
import { IconFermer } from './icons'
import Modale from './Modale'
import { SkeletonTexte } from './Skeleton'
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
      <Modale onClose={onClose} panelClassName="w-full max-w-lg rounded-xl bg-surface p-6 shadow-xl">
        {({ titleId }) => (
          <>
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h3 id={titleId} className="text-lg font-semibold text-texte">
                  {categorie}
                </h3>
                <p className="text-xs text-texte-attenue">{type === 'geo' ? 'Répartition géographique' : 'Répartition sectorielle'}</p>
              </div>
              <button onClick={onClose} aria-label="Fermer" className="text-texte-attenue hover:text-texte">
                <IconFermer className="h-4 w-4" />
              </button>
            </div>

            {loading && <SkeletonTexte />}
            {error && <EtatErreur message={error} />}

            {data && data.lignes.length === 0 && <EtatVide titre="Aucune ligne ne compose cette catégorie." />}

            {data && data.lignes.length > 0 && (
              <>
                <p className="mb-2 text-sm text-texte">
                  Valeur totale : <span className="font-medium text-texte">{formatEuro(data.valeur_totale, 2, montantsMasques)}</span>
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

                <ul className="mt-3 divide-y divide-bordure border-t border-bordure">
                  {data.lignes.map((l) => (
                    <li key={l.ticker}>
                      <button
                        type="button"
                        onClick={() => setSelectedTicker(l.ticker)}
                        className="flex w-full items-center justify-between py-2 text-left text-sm hover:bg-surface-elevee"
                      >
                        <span className="text-texte">{l.nom ?? l.ticker}</span>
                        <span className="font-medium text-texte">{formatEuro(l.valeur, 2, montantsMasques)}</span>
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
