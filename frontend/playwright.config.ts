import { defineConfig, devices } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// `"type": "module"` (package.json) : ce fichier est chargé en ESM, `__dirname`/
// `require` n'y existent pas — équivalent standard via `import.meta.url`.
const DIRNAME = path.dirname(fileURLToPath(import.meta.url))

export const FRONTEND_PORT = 4180
export const BACKEND_PORT = 8010
export const BACKEND_URL = `http://127.0.0.1:${BACKEND_PORT}`
export const DATA_DIR = path.join(DIRNAME, 'e2e', '.e2e-data')
export const STORAGE_STATE_PATH = path.join(DATA_DIR, 'storage-state.json')

/** Suite E2E (navigateur réel, Playwright) contre un backend isolé sur une base
 * SQLite jetable, jamais la vraie base de l'utilisateur — cf. `e2e/global-setup.ts`
 * pour l'orchestration (démarrage du backend, seed des données, arrêt propre) et
 * `backend/scripts/seed_e2e.py` pour le jeu de données. Complète (ne remplace pas)
 * la suite Vitest existante (chaque `*.test.tsx` sous `src/`, composants isolés avec l'API
 * mockée) : ici, un vrai navigateur pilote la vraie application compilée contre un
 * vrai backend, seul moyen de détecter une régression d'intégration (routage,
 * contrat API réellement incompatible, calcul backend faux affiché par un
 * composant par ailleurs correctement testé).
 *
 * `workers: 1` (délibéré, pas encore optimisé) : tous les tests partagent le MÊME
 * backend/la même base seedée — les faire tourner en parallèle exposerait les tests
 * mutants (catégoriser un mouvement, ajouter une valorisation...) à des
 * interférences croisées. À revisiter si la durée totale devient gênante (bases
 * seedées séparées par worker). */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['html', { open: 'never' }], ['list']] : [['list']],
  globalSetup: path.join(DIRNAME, 'e2e', 'global-setup.ts'),
  use: {
    baseURL: `http://127.0.0.1:${FRONTEND_PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], storageState: STORAGE_STATE_PATH },
      dependencies: ['setup'],
    },
  ],
  webServer: {
    // Build de prod + `vite preview` (plus proche du déploiement réel qu'un `vite
    // dev`) — `PATRIMOINE_E2E_BACKEND_URL` fait pointer le proxy /api vers le
    // backend isolé démarré par `global-setup.ts` (cf. `vite.config.ts`), jamais le
    // port 8000 par défaut d'un `npm run dev` local qui tournerait en parallèle. En
    // CI, `npm run build` a déjà tourné une première fois comme étape dédiée
    // (`.github/workflows/ci.yml`) — le rebuild ici est donc quasi instantané
    // (cache Vite chaud, aucun fichier source changé) ; le garder malgré tout côté
    // local évite de servir un `dist/` périmé si on lance `npm run test:e2e` sans
    // avoir rebuild à la main au préalable.
    command: `npm run build && npm run preview -- --port ${FRONTEND_PORT} --strictPort`,
    url: `http://127.0.0.1:${FRONTEND_PORT}`,
    env: { PATRIMOINE_E2E_BACKEND_URL: BACKEND_URL },
    reuseExistingServer: false,
    timeout: 180_000,
    // Sans ceci, un échec de `npm run build`/`preview` (ex. `tsc -b` en erreur)
    // reste invisible : Playwright n'affiche que "Timed out waiting Nms from
    // config.webServer", jamais la sortie réelle de la commande — piège rencontré
    // en CI (job "e2e" échoué sans aucun diagnostic exploitable dans les logs).
    stdout: 'pipe',
    stderr: 'pipe',
  },
})
