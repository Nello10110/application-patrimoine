import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { Session } from '../api/types'
import Card from './Card'
import EtatErreur from './EtatErreur'
import { SkeletonTexte } from './Skeleton'
import { formatDateHeure } from '../utils/format'

/** Sessions actives du compte (backlog 2.L.2) : liste tous les jetons valides (un
 * par appareil/navigateur connecté), révocables individuellement — jamais "tout
 * déconnecter" en un clic, pour ne pas se déconnecter soi-même par erreur en
 * révoquant la session courante (bouton désactivé sur cette ligne). */
export default function SessionsCard() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  function load() {
    setLoading(true)
    api
      .listSessions()
      .then(setSessions)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  async function handleRevoke(idSession: string) {
    setError(null)
    try {
      await api.revokeSession(idSession)
      load()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <Card title="Sessions actives">
      <p className="mb-4 text-sm text-texte-attenue">
        Un appareil ou navigateur connecté par ligne. Révoquer une session déconnecte immédiatement cet appareil, sans
        toucher aux autres.
      </p>
      {loading ? (
        <SkeletonTexte />
      ) : (
        <ul className="divide-y divide-bordure">
          {sessions.map((s) => (
            <li key={s.id_session} className="flex items-center justify-between gap-4 py-2 text-sm">
              <span className="min-w-0">
                <span className="block truncate text-texte">
                  {s.ip ?? 'IP inconnue'} {s.est_courante && <span className="text-xs text-accent">(session actuelle)</span>}
                </span>
                <span className="block truncate text-xs text-texte-attenue">
                  {s.user_agent ?? 'Agent inconnu'} · dernière activité {formatDateHeure(s.derniere_utilisation)}
                </span>
              </span>
              <button
                onClick={() => handleRevoke(s.id_session)}
                disabled={s.est_courante}
                className="shrink-0 text-xs text-negatif hover:underline disabled:opacity-40 disabled:hover:no-underline"
              >
                Révoquer
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <EtatErreur message={error} onReessayer={load} />}
    </Card>
  )
}
