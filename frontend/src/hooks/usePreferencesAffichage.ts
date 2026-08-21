import { useContext } from 'react'
import { PreferencesAffichageContext, type PreferencesAffichageContextValue } from '../contexts/preferencesAffichageContextObject'

export function usePreferencesAffichage(): PreferencesAffichageContextValue {
  const ctx = useContext(PreferencesAffichageContext)
  if (!ctx) throw new Error('usePreferencesAffichage doit être utilisé dans un <PreferencesAffichageProvider>')
  return ctx
}
