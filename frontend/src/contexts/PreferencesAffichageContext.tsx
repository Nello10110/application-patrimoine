import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { PreferencesAffichageContext, type Lentille } from './preferencesAffichageContextObject'

const CLE_LENTILLE = 'patrimoine:lentille'
const CLE_MONTANTS_MASQUES = 'patrimoine:montants-masques'
const CLE_DETENTEUR = 'patrimoine:detenteur-id'
const LENTILLES: Lentille[] = ['net', 'brut', 'financier']

function lentilleStockee(): Lentille {
  if (typeof window === 'undefined') return 'net'
  const valeur = window.localStorage.getItem(CLE_LENTILLE)
  return (LENTILLES as string[]).includes(valeur ?? '') ? (valeur as Lentille) : 'net'
}

function montantsMasquesStockes(): boolean {
  if (typeof window === 'undefined') return false
  return window.localStorage.getItem(CLE_MONTANTS_MASQUES) === '1'
}

function detenteurIdStocke(): number | null {
  if (typeof window === 'undefined') return null
  const valeur = window.localStorage.getItem(CLE_DETENTEUR)
  const nombre = valeur === null ? NaN : Number(valeur)
  return Number.isFinite(nombre) ? nombre : null
}

function champDeSaisieActif(): boolean {
  const el = document.activeElement
  if (!el) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (el as HTMLElement).isContentEditable
}

/** Contrôles transverses persistants (backlog 2.K.3) : lentille patrimoine
 * net/brut/financier, et masquage des montants — appliqués à tous les écrans,
 * persistés dans `localStorage` (même pattern que `useTheme.ts`). Contrairement au
 * thème (piloté par une classe CSS, aucun re-rendu React nécessaire), ces
 * préférences changent le TEXTE affiché par chaque page : un vrai Context est donc
 * nécessaire pour que le changement se propage à tous les écrans, pas seulement au
 * composant qui possède le contrôle. */
export function PreferencesAffichageProvider({ children }: { children: ReactNode }) {
  const [lentille, setLentilleState] = useState<Lentille>(() => lentilleStockee())
  const [montantsMasques, setMontantsMasques] = useState<boolean>(() => montantsMasquesStockes())
  const [detenteurId, setDetenteurIdState] = useState<number | null>(() => detenteurIdStocke())

  const setLentille = useCallback((suivante: Lentille) => {
    setLentilleState(suivante)
    window.localStorage.setItem(CLE_LENTILLE, suivante)
  }, [])

  const setDetenteurId = useCallback((suivant: number | null) => {
    setDetenteurIdState(suivant)
    if (suivant === null) window.localStorage.removeItem(CLE_DETENTEUR)
    else window.localStorage.setItem(CLE_DETENTEUR, String(suivant))
  }, [])

  const toggleMontantsMasques = useCallback(() => {
    setMontantsMasques((avant) => {
      const suivant = !avant
      window.localStorage.setItem(CLE_MONTANTS_MASQUES, suivant ? '1' : '0')
      return suivant
    })
  }, [])

  // Raccourci clavier Ctrl/⌘+Maj+M — ignoré si le focus est sur un champ de saisie,
  // pour ne jamais interférer avec un raccourci de traitement de texte du navigateur
  // ou de l'utilisateur pendant une saisie.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!e.shiftKey || (!e.ctrlKey && !e.metaKey)) return
      if (e.key !== 'M' && e.key !== 'm') return
      if (champDeSaisieActif()) return
      e.preventDefault()
      toggleMontantsMasques()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [toggleMontantsMasques])

  return (
    <PreferencesAffichageContext.Provider
      value={{ lentille, setLentille, montantsMasques, toggleMontantsMasques, detenteurId, setDetenteurId }}
    >
      {children}
    </PreferencesAffichageContext.Provider>
  )
}
