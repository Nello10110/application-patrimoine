import { useState, type ReactNode } from 'react'
import type { AllocationBreakdownItem } from '../api/types'
import { formatEuro, formatPct } from '../utils/format'
import AllocationBarChart from './AllocationBarChart'
import AllocationPieChart from './AllocationPieChart'
import Card from './Card'
import Modale from './Modale'
import StatTile from './StatTile'

type Mode = 'bar' | 'pie'

function IconBarChart({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className={className} aria-hidden="true">
      <path d="M4 20V10M12 20V4M20 20v-7" />
    </svg>
  )
}

function IconPieChart({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M21.21 15.89A10 10 0 1 1 8 2.83" />
      <path d="M22 12A10 10 0 0 0 12 2v10z" />
    </svg>
  )
}

function IconExpand({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3" />
    </svg>
  )
}

function BoutonMode({
  actif,
  onClick,
  titre,
  children,
}: {
  actif: boolean
  onClick: () => void
  titre: string
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={actif}
      title={titre}
      onClick={onClick}
      className={`flex h-7 w-7 items-center justify-center transition-colors ${
        actif
          ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
          : 'bg-white text-slate-500 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700'
      }`}
    >
      {children}
    </button>
  )
}

/** Répartition géo/sectorielle du tableau de bord (LOT 6.10) : un graphique qui bascule
 * entre barres (réel vs cible, comportement d'origine) et camembert (réel seul — une
 * cible n'a pas de sens visuel en camembert, donc volontairement absente de ce mode),
 * plus une vue plein écran avec des informations complémentaires que le graphique seul
 * ne montre pas (écarts chiffrés, poste le plus surpondéré/sous-pondéré). */
export default function AllocationChartCard({
  title,
  items,
  onCategoryClick,
  footnote,
}: {
  title: string
  items: AllocationBreakdownItem[]
  onCategoryClick: (categorie: string) => void
  footnote?: ReactNode
}) {
  const [mode, setMode] = useState<Mode>('bar')
  const [pleinEcran, setPleinEcran] = useState(false)

  const modeToggle = items.length > 0 && (
    <div className="flex overflow-hidden rounded-md border border-slate-200 dark:border-slate-600">
      <BoutonMode actif={mode === 'bar'} onClick={() => setMode('bar')} titre="Barres (réel vs cible)">
        <IconBarChart />
      </BoutonMode>
      <BoutonMode actif={mode === 'pie'} onClick={() => setMode('pie')} titre="Camembert (répartition réelle, sans la cible)">
        <IconPieChart />
      </BoutonMode>
    </div>
  )

  const controlesCarte = items.length > 0 && (
    <div className="flex items-center gap-1.5">
      {modeToggle}
      <button
        type="button"
        aria-label="Agrandir le graphique"
        title="Agrandir"
        onClick={() => setPleinEcran(true)}
        className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-400 dark:hover:bg-slate-700"
      >
        <IconExpand />
      </button>
    </div>
  )

  const totalValeur = items.reduce((acc, i) => acc + i.valeur, 0)
  const itemsAvecCible = items.filter((i) => i.ecart !== null)
  const plusSurpondere = itemsAvecCible.length > 0 ? itemsAvecCible.reduce((max, i) => (i.ecart! > max.ecart! ? i : max)) : null
  const plusSousPondere = itemsAvecCible.length > 0 ? itemsAvecCible.reduce((min, i) => (i.ecart! < min.ecart! ? i : min)) : null

  return (
    <>
      <Card title={title} headerActions={controlesCarte}>
        {items.length > 0 ? (
          mode === 'bar' ? (
            <AllocationBarChart items={items} onCategoryClick={onCategoryClick} />
          ) : (
            <AllocationPieChart items={items} onCategoryClick={onCategoryClick} />
          )
        ) : (
          <p className="text-sm text-slate-500 dark:text-slate-400">Aucune donnée</p>
        )}
        {footnote}
      </Card>

      {pleinEcran && items.length > 0 && (
        <Modale onClose={() => setPleinEcran(false)} panelClassName="w-full max-w-4xl rounded-xl bg-white p-6 shadow-xl">
          {({ titleId }) => (
            <>
              <div className="mb-4 flex items-start justify-between gap-4">
                <h3 id={titleId} className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  {title}
                </h3>
                <div className="flex items-center gap-3">
                  {modeToggle}
                  <button
                    onClick={() => setPleinEcran(false)}
                    aria-label="Fermer"
                    className="text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {mode === 'bar' ? (
                <AllocationBarChart items={items} onCategoryClick={onCategoryClick} />
              ) : (
                <AllocationPieChart items={items} onCategoryClick={onCategoryClick} height={420} />
              )}

              <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
                <StatTile label="Valeur totale" value={formatEuro(totalValeur, 0)} />
                {plusSurpondere && (
                  <StatTile
                    label="Le plus surpondéré"
                    value={formatPct(plusSurpondere.ecart)}
                    sub={plusSurpondere.categorie}
                    tone={plusSurpondere.ecart! > 0 ? 'warning' : 'neutral'}
                  />
                )}
                {plusSousPondere && (
                  <StatTile
                    label="Le plus sous-pondéré"
                    value={formatPct(plusSousPondere.ecart)}
                    sub={plusSousPondere.categorie}
                    tone={plusSousPondere.ecart! < 0 ? 'warning' : 'neutral'}
                  />
                )}
              </div>

              <table className="mt-6 w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:text-slate-400">
                    <th className="py-2 font-medium">Catégorie</th>
                    <th className="py-2 text-right font-medium">Valeur</th>
                    <th className="py-2 text-right font-medium">Réel</th>
                    <th className="py-2 text-right font-medium">Cible</th>
                    <th className="py-2 text-right font-medium">Écart</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {[...items]
                    .sort((a, b) => b.pourcentage_reel - a.pourcentage_reel)
                    .map((item) => (
                      <tr
                        key={item.categorie}
                        className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/50"
                        onClick={() => onCategoryClick(item.categorie)}
                      >
                        <td className="py-2 text-slate-700 dark:text-slate-300">{item.categorie}</td>
                        <td className="py-2 text-right text-slate-900 dark:text-slate-100">{formatEuro(item.valeur, 0)}</td>
                        <td className="py-2 text-right text-slate-900 dark:text-slate-100">{`${item.pourcentage_reel.toFixed(1)}%`}</td>
                        <td className="py-2 text-right text-slate-500 dark:text-slate-400">
                          {item.pourcentage_cible !== null ? `${item.pourcentage_cible.toFixed(1)}%` : '—'}
                        </td>
                        <td
                          className={`py-2 text-right font-medium ${
                            item.ecart === null
                              ? 'text-slate-400 dark:text-slate-500'
                              : item.ecart > 0
                                ? 'text-amber-600 dark:text-amber-400'
                                : item.ecart < 0
                                  ? 'text-blue-600 dark:text-blue-400'
                                  : 'text-slate-500 dark:text-slate-400'
                          }`}
                        >
                          {formatPct(item.ecart)}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>

              {footnote && <div className="mt-4">{footnote}</div>}
            </>
          )}
        </Modale>
      )}
    </>
  )
}
