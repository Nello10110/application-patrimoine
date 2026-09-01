import { expect, test } from '@playwright/test'
import { montantRegex } from './format'
import { seedData } from './seed-data'

test('Épargne : affiche le compte seedé et sa valeur totale', async ({ page }) => {
  const { attendu, holdings } = seedData()
  await page.goto('/epargne')
  await expect(page.getByRole('heading', { name: 'Épargne' })).toBeVisible()
  await expect(page.getByText(holdings.livret.ticker)).toBeVisible()

  // La valeur (15 000,00 €) apparaît aussi sur la carte du compte lui-même et dans
  // son historique de valorisation — la tuile "Valeur totale" est la seule ayant ce
  // libellé pour parent direct.
  const tuileValeurTotale = page.locator('div', { has: page.getByText('Valeur totale', { exact: true }) }).last()
  await expect(tuileValeurTotale.getByText(montantRegex(attendu.valeur_livret, 2))).toBeVisible()
})
