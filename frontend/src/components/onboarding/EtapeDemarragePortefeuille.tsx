import { useEffect, useState } from 'react'
import { api } from '../../api/client'
import AjoutHoldingForm from '../AjoutHoldingForm'
import ImportTransactionsSection from '../ImportTransactionsSection'
import { SkeletonTexte } from '../Skeleton'

/** Étape "Démarrer le portefeuille" de `steps.ts` — contrairement aux autres étapes,
 * n'était au départ qu'une description textuelle des deux façons de peupler le
 * portefeuille (retour utilisateur, 2026-09-01 : « accompagné à saisir toutes les
 * premières valeurs et importer les informations », pas juste renvoyé vers d'autres
 * écrans). Embarque désormais les DEUX vrais flux, réellement actionnables ici :
 * `AjoutHoldingForm` (saisie manuelle, extrait de `PortefeuillePage.tsx`) et
 * `ImportTransactionsSection` (import d'un historique complet, extrait
 * d'`ImportPage.tsx`) — même mise en page empilée « ou » qu'`ImportPage.tsx` lui-même.
 *
 * Le compteur de positions se recharge après CHAQUE action (ajout ou import) : c'est
 * ce qui permet au message d'introduction de rester exact tout au long de l'étape,
 * pas seulement à son ouverture. */
export default function EtapeDemarragePortefeuille() {
  const [nombrePositions, setNombrePositions] = useState<number | null>(null)

  function recharger() {
    api
      .listHoldings()
      .then((holdings) => setNombrePositions(holdings.length))
      .catch(() => setNombrePositions(0))
  }

  useEffect(recharger, [])

  if (nombrePositions === null) return <SkeletonTexte />

  return (
    <div className="space-y-4">
      <p className="text-sm text-texte">
        {nombrePositions > 0 ? (
          <>
            Le portefeuille compte déjà{' '}
            <span className="font-medium text-texte">
              {nombrePositions} position{nombrePositions > 1 ? 's' : ''}
            </span>
            . Ajoute-en d'autres à la main, ou importe un historique complet :
          </>
        ) : (
          "Ajoute une première position à la main, ou importe directement un historique complet de transactions :"
        )}
      </p>

      <AjoutHoldingForm onCreated={() => setNombrePositions((n) => (n ?? 0) + 1)} />

      <div className="flex items-center gap-3 text-xs font-medium uppercase tracking-wide text-texte-attenue">
        <div className="h-px flex-1 bg-bordure" />
        ou
        <div className="h-px flex-1 bg-bordure" />
      </div>

      <ImportTransactionsSection onImported={recharger} />
    </div>
  )
}
