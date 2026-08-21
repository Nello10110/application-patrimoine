import { Link, useParams } from 'react-router-dom'
import HoldingDetailContent from '../components/HoldingDetailContent'
import { useHoldingDetail } from '../hooks/useHoldingDetail'

export default function HoldingDetailPage() {
  const { ticker } = useParams<{ ticker: string }>()
  const { detail, loading, error } = useHoldingDetail(ticker)

  if (loading) return <p className="text-slate-500 dark:text-slate-400">Chargement...</p>
  if (error) return <p className="text-red-600 dark:text-red-400">Erreur: {error}</p>
  if (!detail) return null

  return (
    <div className="space-y-6">
      <Link to="/patrimoine" className="text-sm text-blue-600 hover:underline dark:text-blue-400">
        ← Retour au patrimoine
      </Link>
      <HoldingDetailContent detail={detail} />
    </div>
  )
}
