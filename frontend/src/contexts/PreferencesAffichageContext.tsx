import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { PreferencesAffichageContext, type Lentille } from './preferencesAffichageContextObject'
import { PERIODE_DEFAUT, type Periode } from '../utils/periode'

const CLE_LENTILLE = 'patrimoine:lentille'
const CLE_MONTANTS_MASQUES = 'patrimoine:montants-masques'
const CLE_DETENTEUR = 'patrimoine:detenteur-id'
const CLE_PERIODE = 'patrimoine:periode'
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

/** `Periode` est un objet (contrairement aux autres préférences, des primitives) :
 * sérialisé en JSON, avec repli sur la valeur par défaut si le contenu stocké est
 * absent ou invalide (format changé, corruption manuelle...). */
function periodeStockee(): Periode {
  if (typeof window === 'undefined') return PERIODE_DEFAUT
  const brut = window.localStorage.getItem(CLE_PERIODE)
  if (!brut) return PERIODE_DEFAUT
  try {
    const valeur = JSON.parse(brut)
    if (valeur?.type === 'relative' || valeur?.type === 'personnalisee') return valeur as Periode
    return PERIODE_DEFAUT
  } catch {
    return PERIODE_DEFAUT
  }
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
  const [periode, setPeriodeState] = useState<Periode>(() => periodeStockee())

  const setLentille = useCallback((suivante: Lentille) => {
    setLentilleState(suivante)
    window.localStorage.setItem(CLE_LENTILLE, suivante)
  }, [])

  const setDetenteurId = useCallback((suivant: number | null) => {
    setDetenteurIdState(suivant)
    if (suivant === null) window.localStorage.removeItem(CLE_DETENTEUR)
    else window.localStorage.setItem(CLE_DETENTEUR, String(suivant))
  }, [])

  const setPeriode = useCallback((suivante: Periode) => {
    setPeriodeState(suivante)
    window.localStorage.setItem(CLE_PERIODE, JSON.stringify(suivante))
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
      value={{ lentille, setLentille, montantsMasques, toggleMontantsMasques, detenteurId, setDetenteurId, periode, setPeriode }}
    >
      {children}
    </PreferencesAffichageContext.Provider>
  )
}
