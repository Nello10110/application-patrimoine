import { Link, useParams } from 'react-router-dom'
import HoldingDetailContent from '../components/HoldingDetailContent'
import { useHoldingDetail } from '../hooks/useHoldingDetail'

export default function HoldingDetailPage() {
  const { ticker } = useParams<{ ticker: string }>()
  const { detail, loading, error } = useHoldingDetail(ticker)

  if (loading) return <p className="text-slate-500">Chargement...</p>
  if (error) return <p className="text-red-600">Erreur: {error}</p>
  if (!detail) return null

  return (
    <div className="space-y-6">
      <Link to="/portefeuille" className="text-sm text-blue-600 hover:underline">
        ← Retour au portefeuille
      </Link>
      <HoldingDetailContent detail={detail} />
    </div>
  )
}
