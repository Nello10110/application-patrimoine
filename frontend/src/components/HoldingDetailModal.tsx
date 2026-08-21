import { Link } from 'react-router-dom'
import { useHoldingDetail } from '../hooks/useHoldingDetail'
import HoldingDetailContent from './HoldingDetailContent'
import Modale from './Modale'

export default function HoldingDetailModal({ ticker, onClose }: { ticker: string; onClose: () => void }) {
  const { detail, loading, error } = useHoldingDetail(ticker)

  return (
    <Modale onClose={onClose} panelClassName="w-full max-w-3xl rounded-xl bg-white p-6 shadow-xl">
      {({ titleId }) => (
        <>
          <div className="mb-2 flex items-start justify-between gap-4">
            <h2 id={titleId} className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              {detail?.nom ?? ticker}
            </h2>
            <button
              onClick={onClose}
              aria-label="Fermer"
              className="shrink-0 text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
            >
              ✕
            </button>
          </div>

          {/* LOT 6.1 : seul lien de l'application vers la fiche en pleine page
              (`/patrimoine/:ticker`) — sans lui, cette route n'est atteignable
              qu'en tapant l'URL. Ferme la modale pour ne pas la laisser ouverte
              par-dessus la page de destination. */}
          <Link
            to={`/patrimoine/${encodeURIComponent(ticker)}`}
            onClick={onClose}
            className="mb-4 inline-block text-xs text-blue-600 hover:underline dark:text-blue-400"
          >
            Ouvrir en pleine page ↗
          </Link>

          {loading && <p className="text-sm text-slate-500 dark:text-slate-400">Chargement...</p>}
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          {detail && <HoldingDetailContent detail={detail} />}
        </>
      )}
    </Modale>
  )
}
