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
}

export const AuthContext = createContext<AuthContextValue | null>(null)
