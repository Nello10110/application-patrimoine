import { createContext } from 'react'
import type { Periode } from '../utils/periode'

export type Lentille = 'net' | 'brut' | 'financier'

export interface PreferencesAffichageContextValue {
  lentille: Lentille
  setLentille: (lentille: Lentille) => void
  montantsMasques: boolean
  toggleMontantsMasques: () => void
  // Filtre détenteur global (backlog 2.L.1/2.K.3) : `null` = vue foyer consolidée.
  detenteurId: number | null
  setDetenteurId: (detenteurId: number | null) => void
  // Période transverse (backlog 2.K.3) : n'affecte que le graphique d'évolution du
  // patrimoine et le Rapport — cf. docstring de `utils/periode.ts`.
  periode: Periode
  setPeriode: (periode: Periode) => void
}

export const PreferencesAffichageContext = createContext<PreferencesAffichageContextValue | null>(null)
