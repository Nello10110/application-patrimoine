import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { HoldingDetail } from '../api/types'

/** Charge la fiche détaillée d'une position, recharge si `ticker` change. */
export function useHoldingDetail(ticker: string | undefined) {
  const [detail, setDetail] = useState<HoldingDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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
  }, [ticker])

  return { detail, loading, error }
}
