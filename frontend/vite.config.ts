import { configDefaults, defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// Cible du proxy /api, configurable (E2E, `e2e/playwright.config.ts`) : pointe par
// défaut sur le backend de dev habituel (port 8000, comportement strictement
// inchangé) ; la suite Playwright la fait pointer vers un backend isolé (port 8010,
// base SQLite jetable) pour ne jamais dépendre d'un `npm run dev` déjà lancé en
// parallèle ni risquer de toucher la vraie base de l'utilisateur.
const CIBLE_PROXY_API = process.env.PATRIMOINE_E2E_BACKEND_URL || 'http://127.0.0.1:8000'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // Application installable (roadmap Phase 3, § H.1) : manifeste + service worker
    // générés par le plugin (Workbox), pas écrits à la main — la mise en cache d'un
    // service worker maison est un piège classique (versions périmées servies
    // indéfiniment) que Workbox gère correctement de série.
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'Application Patrimoine',
        short_name: 'Patrimoine',
        description: "Suivi et gestion de portefeuille boursier, analyse de patrimoine et suivi d'objectifs financiers.",
        lang: 'fr',
        start_url: '/',
        display: 'standalone',
        background_color: '#f8fafc',
        theme_color: '#0f172a',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // L'API (`/api/*`) n'est JAMAIS mise en cache par le service worker : les
        // données financières affichées doivent toujours venir du backend en
        // direct, jamais d'une réponse figée — seuls les fichiers statiques du
        // build (JS/CSS/icônes) bénéficient du cache hors-ligne.
        navigateFallbackDenylist: [/^\/api\//],
      },
    }),
  ],
  server: {
    proxy: {
      '/api': CIBLE_PROXY_API,
    },
  },
  // Même proxy qu'en dev pour `vite preview` (build de production servi localement) :
  // sans lui, vérifier le service worker généré (§ H.1) contre le vrai backend serait
  // impossible en local — c'est aussi ce mode que la suite Playwright utilise.
  preview: {
    proxy: {
      '/api': CIBLE_PROXY_API,
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    // `e2e/*.spec.ts` (suite Playwright, `e2e/playwright.config.ts`) utilise le
    // même motif `*.spec.ts` que le filtre par défaut de Vitest — exclu
    // explicitement, sinon Vitest tente de les exécuter avec son propre runner
    // (échec immédiat : ces fichiers importent `@playwright/test`, pas `vitest`).
    exclude: [...configDefaults.exclude, 'e2e/**'],
    // Fixe le fuseau du runner à UTC : plusieurs tests (ex. `formatDateHeure`)
    // vérifient une conversion UTC → locale et supposaient à tort que l'environnement
    // de test tournait déjà en UTC, sans jamais l'imposer — dépendant silencieusement
    // du fuseau système de la machine qui exécute `npm run test`.
    env: { TZ: 'UTC' },
  },
})
