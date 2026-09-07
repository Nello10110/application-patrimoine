import { useEffect, useState } from 'react'
import type { CategoryCompositionResponse } from '../api/types'
import EtatErreur from './EtatErreur'
import EtatVide from './EtatVide'
import HoldingDetailModal from './HoldingDetailModal'
import { IconFermer } from './icons'
import { RepartitionEmpilee } from './ChartFrame'
import Modale from './Modale'
import { SkeletonTexte } from './Skeleton'
import { usePreferencesAffichage } from '../hooks/usePreferencesAffichage'
import { formatEuro } from '../utils/format'


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
      <Modale onClose={onClose} panelClassName="w-full max-w-lg rounded-panel border border-stroke bg-panel-hi shadow-glass-lg backdrop-blur-glass p-6">
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
                {/* Barre empilée + liste plutôt qu'un camembert (passe d'uniformité) :
                    cette modale s'ouvre depuis l'écran Analyse, au clic sur une barre
                    de répartition — passer d'une barre à un camembert pour descendre
                    d'un niveau de détail changeait de langage en cours de route. */}
                <RepartitionEmpilee
                  parts={[...data.lignes]
                    .sort((a, b) => b.valeur - a.valeur)
                    .map((l) => ({
                      nom: l.nom ?? l.ticker,
                      pourcentage: data.valeur_totale > 0 ? (l.valeur / data.valeur_totale) * 100 : 0,
                      valeur: formatEuro(l.valeur, 2, montantsMasques),
                    }))}
                />

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
