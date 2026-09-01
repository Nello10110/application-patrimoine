import { expect, test } from '@playwright/test'
import type { RouteMeta } from '../src/layout/routes'
import { ROUTES } from '../src/layout/routes'

// Périmètre piloté par la source unique de vérité (`layout/routes.ts`, cf. sa
// docstring) plutôt qu'une liste recopiée à la main ici — un écran ajouté à
// `ROUTES` entre automatiquement dans ce test de non-régression. Routes à
// paramètre dynamique (`/patrimoine/:ticker`) exclues : couvertes par
// `holding-detail.spec.ts` avec un vrai ticker seedé.
const ROUTES_STATIQUES = ROUTES.filter((r: RouteMeta) => r.navLabel && !r.path.includes(':'))

test.describe('Navigation', () => {
  for (const route of ROUTES_STATIQUES) {
    test(`${route.path} charge sans erreur console`, async ({ page }) => {
      const erreurs: string[] = []
      page.on('console', (msg) => {
        if (msg.type() === 'error') erreurs.push(msg.text())
      })

      await page.goto(route.path)
      await expect(page.getByRole('navigation', { name: 'Navigation principale' })).toBeVisible()
      await expect(page.getByRole('heading', { level: 2 }).first()).toBeVisible()
      expect(erreurs, `erreurs console sur ${route.path}`).toEqual([])
    })
  }

  test('barre latérale desktop laisse place à la barre inférieure en mobile', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('navigation', { name: 'Navigation principale' })).toBeVisible()

    await page.setViewportSize({ width: 375, height: 812 })
    // La barre latérale desktop se masque (`md:flex` côté CSS) — la navigation
    // mobile prend le relais (backlog 2.K.4).
    await expect(page.getByRole('link', { name: 'Synthèse' }).first()).toBeVisible()
  })
})
