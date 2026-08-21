import { Link } from 'react-router-dom'
import { useHoldingDetail } from '../hooks/useHoldingDetail'
import { SkeletonTexte } from './Skeleton'
import EtatErreur from './EtatErreur'
import HoldingDetailContent from './HoldingDetailContent'
import { IconFermer, IconLienExterne } from './icons'
import Modale from './Modale'

export default function HoldingDetailModal({ ticker, onClose }: { ticker: string; onClose: () => void }) {
  const { detail, loading, error, recharger } = useHoldingDetail(ticker)

  return (
    <Modale onClose={onClose} panelClassName="w-full max-w-3xl rounded-xl bg-surface p-6 shadow-xl">
      {({ titleId }) => (
        <>
          <div className="mb-2 flex items-start justify-between gap-4">
            <h2 id={titleId} className="text-lg font-semibold text-texte">
              {detail?.nom ?? ticker}
            </h2>
            <button onClick={onClose} aria-label="Fermer" className="shrink-0 text-texte-attenue hover:text-texte">
              <IconFermer className="h-4 w-4" />
            </button>
          </div>

          {/* LOT 6.1 : seul lien de l'application vers la fiche en pleine page
              (`/patrimoine/:ticker`) — sans lui, cette route n'est atteignable
              qu'en tapant l'URL. Ferme la modale pour ne pas la laisser ouverte
              par-dessus la page de destination. `state.depuisPatrimoine` (backlog
              2.K.2) permet à `HoldingDetailPage` de distinguer un retour fiable
              (`navigate(-1)`, restitue filtres/tri/défilement de Portefeuille)
              d'un accès direct par URL. */}
          <Link
            to={`/patrimoine/${encodeURIComponent(ticker)}`}
            state={{ depuisPatrimoine: true }}
            onClick={onClose}
            className="mb-4 inline-flex items-center gap-1 text-xs text-accent hover:underline"
          >
            Ouvrir en pleine page <IconLienExterne className="h-3 w-3" />
          </Link>

          {loading && <SkeletonTexte lignes={4} />}
          {error && <EtatErreur message={error} onReessayer={recharger} />}
          {detail && <HoldingDetailContent detail={detail} />}
        </>
      )}
    </Modale>
  )
}
