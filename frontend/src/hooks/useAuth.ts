import { useContext } from 'react'
import { AuthContext, type AuthContextValue } from '../contexts/authContextObject'

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth doit être utilisé dans un <AuthProvider>')
  return ctx
}
