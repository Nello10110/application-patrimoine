import { vi } from 'vitest'

/** Simule un viewport mobile/desktop pour les tests de `useEstMobile` (backlog
 * 2.K.4) — remplace `window.matchMedia` (déjà stubbé par `src/test/setup.ts`, ici
 * juste redéfini pour renvoyer `matches` explicitement) par une implémentation qui
 * répond `estMobile` à toute requête, quelle qu'elle soit (un seul point de rupture
 * dans l'app, cf. `useEstMobile.ts`, pas besoin de distinguer les requêtes). */
export function simulerLargeurEcran(estMobile: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: estMobile,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(() => false),
  })) as unknown as typeof window.matchMedia
}
