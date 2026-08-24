/** Chargé avant chaque fichier de test (cf. `test.setupFiles` dans vite.config.ts) :
 * ajoute les matchers jest-dom (`toBeInTheDocument`, etc.) à `expect` de Vitest et
 * démonte les composants rendus après chaque test (pas de globals Vitest activés,
 * donc pas de nettoyage automatique implicite par @testing-library/react). */
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'

// Polyfill minimal de `window.matchMedia`, absent de jsdom (backlog 2.K.4,
// `useEstMobile`) : sans lui, tout composant qui l'appelle lève une `TypeError` au
// rendu. `matches: false` par défaut simule un viewport desktop — un test qui veut
// simuler mobile redéfinit `window.matchMedia` explicitement (cf.
// `src/test/matchMedia.ts::simulerLargeurEcran`).
function matchMediaDesktopParDefaut(query: string): MediaQueryList {
  return {
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  } as MediaQueryList
}
window.matchMedia ??= matchMediaDesktopParDefaut

afterEach(() => {
  cleanup()
  // Remet le viewport simulé à "desktop" après chaque test — sans ça, un test qui
  // appelle `simulerLargeurEcran(true)` laisserait tous les suivants croire à un
  // viewport mobile (`window.matchMedia` n'est qu'une affectation directe, pas un
  // mock Vitest auto-restauré).
  window.matchMedia = matchMediaDesktopParDefaut
})
