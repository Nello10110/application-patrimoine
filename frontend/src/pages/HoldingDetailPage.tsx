import { useLocation, useNavigate, useParams } from 'react-router-dom'
import HoldingDetailContent from '../components/HoldingDetailContent'
import EtatErreur from '../components/EtatErreur'
import { SkeletonTexte } from '../components/Skeleton'
import { IconFlecheGauche } from '../components/icons'
import { useHoldingDetail } from '../hooks/useHoldingDetail'

export default function HoldingDetailPage() {
  const { ticker } = useParams<{ ticker: string }>()
  const { detail, loading, error, recharger } = useHoldingDetail(ticker)
  const navigate = useNavigate()
  const location = useLocation()

  // Retour fiable (backlog 2.K.2) : si on vient bien de Portefeuille (marqué par
  // `HoldingDetailModal` via `state.depuisPatrimoine`), `navigate(-1)` restitue
  // l'URL exacte précédente (catégorie/compte en query params, cf. PortefeuillePage)
  // — sinon (accès direct par URL/marque-page, pas d'historique interne), retombe
  // sur la liste générale.
  function handleRetour() {
    if ((location.state as { depuisPatrimoine?: boolean } | null)?.depuisPatrimoine) navigate(-1)
    else navigate('/patrimoine')
  }

  if (loading) return <SkeletonTexte lignes={5} />
  if (error) return <EtatErreur message={error} onReessayer={recharger} />
  if (!detail) return null

  return (
    <div className="space-y-6">
      <button onClick={handleRetour} className="inline-flex items-center gap-1 text-sm text-accent hover:underline">
        <IconFlecheGauche className="h-4 w-4" /> Retour au patrimoine
      </button>
      <HoldingDetailContent detail={detail} />
    </div>
  )
}
