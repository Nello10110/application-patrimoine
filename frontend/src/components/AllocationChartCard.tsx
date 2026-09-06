import { useState, type ReactNode } from 'react'
import type { AllocationBreakdownItem } from '../api/types'
import { usePreferencesAffichage } from '../hooks/usePreferencesAffichage'
import { formatEuro } from '../utils/format'
import AllocationBarChart from './AllocationBarChart'
import Card from './Card'
import EtatVide from './EtatVide'
import { IconFermer } from './icons'
import Modale from './Modale'
import StatTile from './StatTile'

function IconExpand({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3" />
    </svg>
  )
}

/** Répartition géo/sectorielle du tableau de bord (LOT 6.10) : des barres horizontales,
 * plus une vue plein écran avec le détail chiffré par catégorie que le graphique seul
 * ne montre pas.
 *
 * La bascule barres/camembert a été retirée à la refonte « liquid glass » : demander à
 * l'utilisateur de CHOISIR la forme de son graphique lui fait porter une décision de
 * design. Les barres gagnent ici sans discussion — elles se lisent triées, portent leur
 * libellé en clair, et restent lisibles au-delà de cinq catégories là où le camembert
 * devient un anneau de miettes. Le camembert reste employé ailleurs (`PieChartCard`),
 * pour des compositions à peu de parts. */
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
  const [pleinEcran, setPleinEcran] = useState(false)

  const controlesCarte = items.length > 0 && (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        aria-label="Agrandir le graphique"
        title="Agrandir"
        onClick={() => setPleinEcran(true)}
        className="flex h-11 w-11 items-center justify-center rounded-control border border-hairline bg-chip text-ink3 transition-colors hover:bg-hover md:h-8 md:w-8"
      >
        <IconExpand />
      </button>
    </div>
  )

  const totalValeur = items.reduce((acc, i) => acc + i.valeur, 0)

  return (
    <>
      <Card title={title} headerActions={controlesCarte}>
        {items.length > 0 ? (
          <AllocationBarChart items={items} onCategoryClick={onCategoryClick} />
        ) : (
          <EtatVide
            titre="Aucune donnée de répartition disponible."
            description="Ajoute des positions au portefeuille, ou vérifie leur classification géographique/sectorielle sur la fiche de chaque titre."
          />
        )}
        {footnote}
      </Card>

      {pleinEcran && items.length > 0 && (
        <Modale onClose={() => setPleinEcran(false)} panelClassName="w-full max-w-4xl rounded-panel border border-stroke bg-panel-hi p-6 shadow-glass-lg backdrop-blur-glass">
          {({ titleId }) => (
            <>
              <div className="mb-4 flex items-start justify-between gap-4">
                <h3 id={titleId} className="text-[19px] font-semibold tracking-title text-ink">
                  {title}
                </h3>
                <button onClick={() => setPleinEcran(false)} aria-label="Fermer" className="text-ink3 hover:text-ink">
                  <IconFermer className="h-4 w-4" />
                </button>
              </div>

              <AllocationBarChart items={items} onCategoryClick={onCategoryClick} />

              <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
                <StatTile label="Valeur totale" value={formatEuro(totalValeur, 0, montantsMasques)} />
              </div>

              <table className="mt-6 w-full text-sm">
                <thead>
                  <tr className="border-b border-hairline text-left text-xs uppercase tracking-wide text-ink3">
                    <th className="py-2 font-medium">Catégorie</th>
                    <th className="py-2 text-right font-medium">Valeur</th>
                    <th className="py-2 text-right font-medium">Réel</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {[...items]
                    .sort((a, b) => b.pourcentage_reel - a.pourcentage_reel)
                    .map((item) => (
                      <tr
                        key={item.categorie}
                        className="cursor-pointer hover:bg-hover"
                        onClick={() => onCategoryClick(item.categorie)}
                      >
                        <td className="py-2 text-ink">{item.categorie}</td>
                        <td className="py-2 text-right text-ink2">{formatEuro(item.valeur, 0, montantsMasques)}</td>
                        <td className="py-2 text-right text-ink2">{`${item.pourcentage_reel.toFixed(1)}%`}</td>
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
