import { useCallback, useState } from 'react'

const CLE_STOCKAGE = 'patrimoine:sidebar-repliee'

function etatStocke(): boolean {
  if (typeof window === 'undefined') return false
  return window.localStorage.getItem(CLE_STOCKAGE) === '1'
}

/** État replié/déplié de la barre latérale (backlog 2.K.2), persisté dans
 * `localStorage` — même pattern que `useTheme.ts` pour un réglage d'interface
 * qui doit survivre au rechargement de la page. */
export function useSidebarRepliee() {
  const [repliee, setRepliee] = useState<boolean>(() => etatStocke())

  const basculer = useCallback(() => {
    setRepliee((avant) => {
      const suivant = !avant
      window.localStorage.setItem(CLE_STOCKAGE, suivant ? '1' : '0')
      return suivant
    })
  }, [])

  return { repliee, basculer }
}
