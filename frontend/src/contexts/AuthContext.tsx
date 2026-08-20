import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { api } from '../api/client'
import type { AuthUser } from '../api/types'
import { clearToken, getToken, setToken, setUnauthorizedHandler } from '../auth/tokenStorage'
import { AuthContext, type AuthContextValue } from './authContextObject'

/** Authentification (Milestone 1, multi-utilisateur). Au montage : si un jeton existe
 * déjà en `localStorage`, `GET /auth/me` le valide auprès du serveur (un jeton
 * présent localement peut avoir expiré ou été révoqué ailleurs) avant de considérer
 * l'utilisateur connecté — `loading` reste `true` le temps de cette vérification, pour
 * que `App` n'affiche ni l'écran de connexion ni le contenu protégé en attendant. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null))
    return () => setUnauthorizedHandler(null)
  }, [])

  useEffect(() => {
    if (!getToken()) {
      setLoading(false)
      return
    }
    api
      .getMe()
      .then(setUser)
      .catch(() => clearToken())
      .finally(() => setLoading(false))
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      login: async (email, password) => {
        const { token, user: connecte } = await api.login(email, password)
        setToken(token)
        setUser(connecte)
      },
      register: async (email, password) => {
        const { token, user: cree } = await api.register(email, password)
        setToken(token)
        setUser(cree)
      },
      logout: () => {
        api.logout().catch(() => {
          // Le jeton est de toute façon effacé localement ci-dessous : peu importe
          // que la révocation côté serveur ait réussi (déjà expiré, réseau coupé...).
        })
        clearToken()
        setUser(null)
      },
    }),
    [user, loading],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
