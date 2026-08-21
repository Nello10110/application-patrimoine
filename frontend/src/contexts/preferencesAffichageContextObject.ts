import { createContext } from 'react'

export type Lentille = 'net' | 'brut' | 'financier'

export interface PreferencesAffichageContextValue {
  lentille: Lentille
  setLentille: (lentille: Lentille) => void
  montantsMasques: boolean
  toggleMontantsMasques: () => void
  // Filtre détenteur global (backlog 2.L.1/2.K.3) : `null` = vue foyer consolidée.
  detenteurId: number | null
  setDetenteurId: (detenteurId: number | null) => void
}

export const PreferencesAffichageContext = createContext<PreferencesAffichageContextValue | null>(null)
