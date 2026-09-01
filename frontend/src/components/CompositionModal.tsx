import { useEffect, useState } from 'react'
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
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

/** Détail des lignes d'une catégorie d'un camembert cliquable — réutilisé par le
 * Tableau de bord (géo/secteur du seul portefeuille financier, `sousTitre` fixe) ET
 * `ExpositionConsolideeCard` (géo/classe tous actifs, `sousTitre` dépend en plus de la
 * lentille Net/Brut, backlog retour utilisateur 31/08/2026) — seule la source des
 * données (`fetchComposition`) change entre les deux, jamais dupliquée ici. */
export default function CompositionModal({
  categorie,
  sousTitre,
  fetchComposition,
  onClose,
}: {
  categorie: string
  sousTitre: string
  fetchComposition: (categorie: string) => Promise<CategoryCompositionResponse>
  onClose: () => void
}) {
  const { montantsMasques } = usePreferencesAffichage()
  const [data, setData] = useState<CategoryCompositionResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null)

  function charger() {
    setLoading(true)
    setError(null)
    fetchComposition(categorie)
      .then(setData)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps -- `fetchComposition` change d'identité à chaque rendu de l'appelant (closure inline) ; seul un changement de `categorie` doit redéclencher l'appel, jamais un rendu parent sans rapport.
  useEffect(charger, [categorie])

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
                <p className="text-xs text-texte-attenue">{sousTitre}</p>
              </div>
              <button onClick={onClose} aria-label="Fermer" className="text-texte-attenue hover:text-texte">
                <IconFermer className="h-4 w-4" />
              </button>
            </div>

            {loading && <SkeletonTexte />}
            {error && <EtatErreur message={error} onReessayer={charger} />}

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
