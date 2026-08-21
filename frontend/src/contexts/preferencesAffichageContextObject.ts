import { createContext } from 'react'

export type Lentille = 'net' | 'brut' | 'financier'

export interface PreferencesAffichageContextValue {
  lentille: Lentille
  setLentille: (lentille: Lentille) => void
  montantsMasques: boolean
  toggleMontantsMasques: () => void
}

export const PreferencesAffichageContext = createContext<PreferencesAffichageContextValue | null>(null)
