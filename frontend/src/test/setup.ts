/** Chargé avant chaque fichier de test (cf. `test.setupFiles` dans vite.config.ts) :
 * ajoute les matchers jest-dom (`toBeInTheDocument`, etc.) à `expect` de Vitest et
 * démonte les composants rendus après chaque test (pas de globals Vitest activés,
 * donc pas de nettoyage automatique implicite par @testing-library/react). */
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'

afterEach(() => {
  cleanup()
})
