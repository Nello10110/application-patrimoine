import { createContext } from 'react'
import type { AuthUser } from '../api/types'

export interface AuthContextValue {
  user: AuthUser | null
  loading: boolean
  login: (username: string, password: string) => Promise<void>
  register: (username: string, password: string) => Promise<void>
  logout: () => void
  // Assistant de configuration initiale (welcome board, `WelcomeWizard.tsx`) —
  // appelée par "Terminer" comme par "Passer l'assistant", dans les deux cas
  // l'assistant ne doit plus jamais réapparaître à la prochaine connexion.
  completeOnboarding: () => Promise<void>
  // Recharge l'utilisateur courant depuis `GET /auth/me` (revue du 03/09/2026,
  // écran de rattrapage bloquant) — `RattrapageComptes.tsx` l'appelle une fois
  // toutes les lignes résolues : `user.holdings_sans_compte` retombe à 0, le gate
  // se lève de lui-même au rendu suivant, sans flag de sortie séparé à gérer.
  refetchUser: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)
