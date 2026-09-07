import { expect, test } from '@playwright/test'

/** Curseur des éléments cliquables (retour utilisateur du 07/09/2026 : « la souris
 * ne change pas pour préciser que les champs sont des boutons »).
 *
 * Un `<button>` natif garde `cursor: default` — ce n'est pas un oubli de composant
 * mais le défaut du navigateur, que le reset de Tailwind ne corrige pas. La règle
 * globale d'`index.css` s'en charge ; ce test la vérifie sur le CURSEUR RÉELLEMENT
 * CALCULÉ, seul moyen de détecter qu'une future règle plus spécifique la recouvre.
 *
 * Vitest ne pourrait pas le faire : jsdom ne calcule aucune feuille de style. */
test('les contrôles annoncent leur cliquabilité au curseur', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Tableau de bord' })).toBeVisible()

  const curseur = (l: ReturnType<typeof page.getByRole>) =>
    l.evaluate((el) => getComputedStyle(el).cursor)

  const cibles: [string, ReturnType<typeof page.getByRole>][] = [
    ['segmenté Vue (Brut)', page.getByRole('button', { name: 'Brut' })],
    ['bascule des montants', page.getByRole('button', { name: /Masquer les montants/ })],
    ['thème sombre', page.getByRole('button', { name: 'Thème sombre' })],
    ['période 1M', page.getByRole('button', { name: '1M' })],
    ['Mode étagé', page.getByRole('button', { name: /Mode étagé/ })],
    ['Actualiser', page.getByRole('button', { name: /Actualiser/ })],
    ['sélecteur Détenteur', page.getByRole('combobox').first()],
  ]
  for (const [nom, locator] of cibles) {
    expect(await curseur(locator), nom).toBe('pointer')
  }

  // Un bouton désactivé garde son curseur d'interdiction.
  await page.goto('/patrimoine')
  await page.getByRole('button', { name: 'Ajouter une ligne' }).click()
  const ajouter = page.getByRole('dialog').getByRole('button', { name: 'Ajouter', exact: true })
  await expect(ajouter).toBeDisabled()
  expect(await ajouter.evaluate((el) => getComputedStyle(el).cursor)).toBe('not-allowed')
})
