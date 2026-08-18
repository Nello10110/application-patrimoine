import { useHoldingDetail } from '../hooks/useHoldingDetail'
import HoldingDetailContent from './HoldingDetailContent'

export default function HoldingDetailModal({ ticker, onClose }: { ticker: string; onClose: () => void }) {
  const { detail, loading, error } = useHoldingDetail(ticker)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="relative max-h-[85vh] w-full max-w-3xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={onClose} className="absolute right-4 top-4 text-slate-400 hover:text-slate-600">
          ✕
        </button>

        {loading && <p className="text-sm text-slate-500">Chargement...</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
        {detail && <HoldingDetailContent detail={detail} />}
      </div>
    </div>
  )
}
