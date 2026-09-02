import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { Compte, Holding } from '../api/types'

/** Charge un compte (métadonnées + lignes rattachées), recharge si `compteId`
 * change ou via `recharger()` — même patron que `useHoldingDetail.ts`. */
export function useCompteDetail(compteId: number | undefined) {
  const [compte, setCompte] = useState<Compte | null>(null)
  const [holdings, setHoldings] = useState<Holding[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [compteurRechargement, setCompteurRechargement] = useState(0)

  useEffect(() => {
    if (compteId === undefined) return
    setLoading(true)
    setError(null)
    Promise.all([api.listComptes(), api.getCompteHoldings(compteId)])
      .then(([comptes, lignes]) => {
        const trouve = comptes.find((c) => c.id === compteId)
        if (!trouve) throw new Error('Compte introuvable')
        setCompte(trouve)
        setHoldings(lignes)
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [compteId, compteurRechargement])

  return { compte, holdings, loading, error, recharger: () => setCompteurRechargement((n) => n + 1) }
}
