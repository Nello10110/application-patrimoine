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
    // Retour de connexion Authentik (backlog SSO Authentik) : le backend redirige
    // vers la racine du frontend avec `#token=...` — un fragment n'est jamais envoyé
    // à aucun serveur (ni journalisé par un éventuel proxy intermédiaire), seul le
    // navigateur le lit. On le capture avant toute autre chose, puis on nettoie
    // immédiatement l'URL pour qu'un rechargement/partage du lien ne le réexpose pas.
    if (window.location.hash.startsWith('#token=')) {
      setToken(decodeURIComponent(window.location.hash.slice('#token='.length)))
      window.history.replaceState(null, '', window.location.pathname + window.location.search)
    }

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
      login: async (username, password) => {
        const { token, user: connecte } = await api.login(username, password)
        setToken(token)
        setUser(connecte)
      },
      register: async (username, password) => {
        const { token, user: cree } = await api.register(username, password)
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
      completeOnboarding: async () => {
        const utilisateur = await api.completeOnboarding()
        setUser(utilisateur)
      },
      refetchUser: async () => {
        setUser(await api.getMe())
      },
    }),
    [user, loading],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
