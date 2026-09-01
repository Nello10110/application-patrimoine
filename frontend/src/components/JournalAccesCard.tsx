import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { AccessLogEntry } from '../api/types'
import Card from './Card'
import EtatErreur from './EtatErreur'
import EtatVide from './EtatVide'
import { SkeletonTexte } from './Skeleton'
import { formatDateHeure } from '../utils/format'

/** Journal d'accès (backlog 2.L.2) : qui s'est connecté, quand, résultat — réservé
 * au propriétaire (`require_role`, cf. `routers/auth.py`). Pagination simple. */
export default function JournalAccesCard() {
  const [entrees, setEntrees] = useState<AccessLogEntry[]>([])
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  function charger() {
    setLoading(true)
    setError(null)
    api
      .getAccessLog(page)
      .then(setEntrees)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(charger, [page])

  return (
    <Card title="Journal d'accès">
      <p className="mb-4 text-sm text-texte-attenue">Historique des connexions et déconnexions, réussies ou non.</p>
      {loading ? (
        <SkeletonTexte />
      ) : entrees.length === 0 ? (
        <EtatVide
          titre={`Aucune entrée${page > 1 ? ' sur cette page' : ''}.`}
          description={
            page > 1 ? (
              <button type="button" onClick={() => setPage(1)} className="font-medium text-accent hover:underline">
                Retourner en page 1
              </button>
            ) : undefined
          }
        />
      ) : (
        <ul className="divide-y divide-bordure">
          {entrees.map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-4 py-2 text-sm">
              <span className="text-texte">
                {e.username_saisi} · {e.action === 'login' ? 'connexion' : 'déconnexion'} · {e.ip ?? 'IP inconnue'}
              </span>
              <span className={e.resultat === 'succes' ? 'text-positif' : 'text-negatif'}>
                {e.resultat === 'succes' ? 'Succès' : `Échec (${e.raison ?? '?'})`} · {formatDateHeure(e.timestamp)}
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex items-center gap-3 text-xs">
        <button
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page === 1}
          className="rounded-md border border-bordure px-2 py-1 text-texte disabled:opacity-40"
        >
          Page précédente
        </button>
        <span className="text-texte-attenue">Page {page}</span>
        <button
          onClick={() => setPage((p) => p + 1)}
          disabled={entrees.length === 0}
          className="rounded-md border border-bordure px-2 py-1 text-texte disabled:opacity-40"
        >
          Page suivante
        </button>
      </div>
      {error && <EtatErreur message={error} onReessayer={charger} />}
    </Card>
  )
}
