import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { HoldingDetail } from '../api/types'

/** Charge la fiche détaillée d'une position, recharge si `ticker` change ou via
 * `recharger()` (backlog 2.K.5 — action de reprise sur `EtatErreur`). */
export function useHoldingDetail(ticker: string | undefined) {
  const [detail, setDetail] = useState<HoldingDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [compteurRechargement, setCompteurRechargement] = useState(0)

  useEffect(() => {
    if (!ticker) return
    setDetail(null)
    setLoading(true)
    setError(null)
    api
      .getHoldingDetail(ticker)
      .then(setDetail)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [ticker, compteurRechargement])

  return { detail, loading, error, recharger: () => setCompteurRechargement((n) => n + 1) }
}
