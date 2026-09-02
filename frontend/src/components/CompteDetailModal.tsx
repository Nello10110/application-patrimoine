import { Link } from 'react-router-dom'
import { useCompteDetail } from '../hooks/useCompteDetail'
import CompteDetailContent from './CompteDetailContent'
import EtatErreur from './EtatErreur'
import { IconFermer, IconLienExterne } from './icons'
import Modale from './Modale'
import { SkeletonTexte } from './Skeleton'

export default function CompteDetailModal({ compteId, onClose }: { compteId: number; onClose: () => void }) {
  const { compte, holdings, loading, error, recharger } = useCompteDetail(compteId)

  return (
    <Modale onClose={onClose} panelClassName="w-full max-w-3xl rounded-xl bg-surface p-6 shadow-xl">
      {({ titleId }) => (
        <>
          <div className="mb-2 flex items-start justify-between gap-4">
            <h2 id={titleId} className="text-lg font-semibold text-texte">
              {compte?.nom ?? 'Compte'}
            </h2>
            <button onClick={onClose} aria-label="Fermer" className="shrink-0 text-texte-attenue hover:text-texte">
              <IconFermer className="h-4 w-4" />
            </button>
          </div>

          {/* Même raison que `HoldingDetailModal.tsx` : seul lien vers la fiche en
              pleine page (`/comptes/:id`), sans lequel cette route ne serait
              atteignable qu'en tapant l'URL. */}
          <Link
            to={`/comptes/${compteId}`}
            onClick={onClose}
            className="mb-4 inline-flex items-center gap-1 text-xs text-accent hover:underline"
          >
            Ouvrir en pleine page <IconLienExterne className="h-3 w-3" />
          </Link>

          {loading && <SkeletonTexte lignes={4} />}
          {error && <EtatErreur message={error} onReessayer={recharger} />}
          {compte && <CompteDetailContent compte={compte} holdings={holdings} onChanged={recharger} />}
        </>
      )}
    </Modale>
  )
}
