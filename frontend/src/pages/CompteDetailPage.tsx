import { useNavigate, useParams } from 'react-router-dom'
import CompteDetailContent from '../components/CompteDetailContent'
import EtatErreur from '../components/EtatErreur'
import { IconFlecheGauche } from '../components/icons'
import { SkeletonTexte } from '../components/Skeleton'
import { useCompteDetail } from '../hooks/useCompteDetail'

export default function CompteDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { compte, holdings, loading, error, recharger } = useCompteDetail(id ? Number(id) : undefined)
  const navigate = useNavigate()

  if (loading) return <SkeletonTexte lignes={5} />
  if (error) return <EtatErreur message={error} onReessayer={recharger} />
  if (!compte) return null

  return (
    <div className="space-y-6">
      <button
        onClick={() => navigate('/comptes')}
        className="inline-flex items-center gap-1 text-sm text-accent hover:underline"
      >
        <IconFlecheGauche className="h-4 w-4" /> Retour aux comptes
      </button>
      <CompteDetailContent compte={compte} holdings={holdings} onChanged={recharger} />
    </div>
  )
}
