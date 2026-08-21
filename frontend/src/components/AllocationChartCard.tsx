import { useState, type ReactNode } from 'react'
import type { AllocationBreakdownItem } from '../api/types'
import { usePreferencesAffichage } from '../hooks/usePreferencesAffichage'
import { formatEuro, formatPct } from '../utils/format'
import AllocationBarChart from './AllocationBarChart'
import AllocationPieChart from './AllocationPieChart'
import Card from './Card'
import { IconFermer } from './icons'
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
          ? 'bg-texte text-surface'
          : 'bg-surface text-texte-attenue hover:bg-surface-elevee'
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
  const { montantsMasques } = usePreferencesAffichage()
  const [mode, setMode] = useState<Mode>('bar')
  const [pleinEcran, setPleinEcran] = useState(false)

  const modeToggle = items.length > 0 && (
    <div className="flex overflow-hidden rounded-md border border-bordure">
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
        className="flex h-7 w-7 items-center justify-center rounded-md border border-bordure text-texte-attenue hover:bg-surface-elevee"
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
          <p className="text-sm text-texte-attenue">Aucune donnée</p>
        )}
        {footnote}
      </Card>

      {pleinEcran && items.length > 0 && (
        <Modale onClose={() => setPleinEcran(false)} panelClassName="w-full max-w-4xl rounded-xl bg-surface p-6 shadow-xl">
          {({ titleId }) => (
            <>
              <div className="mb-4 flex items-start justify-between gap-4">
                <h3 id={titleId} className="text-lg font-semibold text-texte">
                  {title}
                </h3>
                <div className="flex items-center gap-3">
                  {modeToggle}
                  <button onClick={() => setPleinEcran(false)} aria-label="Fermer" className="text-texte-attenue hover:text-texte">
                    <IconFermer className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {mode === 'bar' ? (
                <AllocationBarChart items={items} onCategoryClick={onCategoryClick} />
              ) : (
                <AllocationPieChart items={items} onCategoryClick={onCategoryClick} height={420} />
              )}

              <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
                <StatTile label="Valeur totale" value={formatEuro(totalValeur, 0, montantsMasques)} />
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
                  <tr className="border-b border-bordure text-left text-xs uppercase tracking-wide text-texte-attenue">
                    <th className="py-2 font-medium">Catégorie</th>
                    <th className="py-2 text-right font-medium">Valeur</th>
                    <th className="py-2 text-right font-medium">Réel</th>
                    <th className="py-2 text-right font-medium">Cible</th>
                    <th className="py-2 text-right font-medium">Écart</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-bordure">
                  {[...items]
                    .sort((a, b) => b.pourcentage_reel - a.pourcentage_reel)
                    .map((item) => (
                      <tr
                        key={item.categorie}
                        className="cursor-pointer hover:bg-surface-elevee"
                        onClick={() => onCategoryClick(item.categorie)}
                      >
                        <td className="py-2 text-texte">{item.categorie}</td>
                        <td className="py-2 text-right text-texte">{formatEuro(item.valeur, 0, montantsMasques)}</td>
                        <td className="py-2 text-right text-texte">{`${item.pourcentage_reel.toFixed(1)}%`}</td>
                        <td className="py-2 text-right text-texte-attenue">
                          {item.pourcentage_cible !== null ? `${item.pourcentage_cible.toFixed(1)}%` : '—'}
                        </td>
                        <td
                          className={`py-2 text-right font-medium ${
                            item.ecart === null
                              ? 'text-texte-attenue'
                              : item.ecart > 0
                                ? 'text-avertissement'
                                : item.ecart < 0
                                  ? 'text-accent'
                                  : 'text-texte-attenue'
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
