import { useEffect, useState } from 'react'

// Même seuil que Tailwind `md:` (768px par défaut, non modifié dans ce projet —
// backlog 2.K.4, point de rupture unique et assumé).
const REQUETE = '(max-width: 767px)'

function correspond(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia(REQUETE).matches
}

/** Bascule table/cartes, filtres en ligne/feuille glissante... (backlog 2.K.4) —
 * rendu conditionnel en JS plutôt que CSS pur (`hidden md:block`) pour les
 * contenus qui se répètent par ligne (ex. `PositionsTable`) : sans ça, jsdom
 * (sans moteur de mise en page réel) monte les deux variantes en même temps et
 * chaque libellé générique ("Modifier", "Supprimer"...) devient ambigu dans les
 * tests. `matchMedia` réagit aux changements de largeur (redimensionnement,
 * rotation d'un appareil) sans rechargement de page. */
export function useEstMobile(): boolean {
  const [estMobile, setEstMobile] = useState(correspond)

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const mql = window.matchMedia(REQUETE)
    function onChange() {
      setEstMobile(mql.matches)
    }
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])

  return estMobile
}
