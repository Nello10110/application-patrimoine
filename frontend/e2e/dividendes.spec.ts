import { expect, test } from '@playwright/test'
import { montantRegex } from './format'

test('Dividendes : affiche le total perçu seedé', async ({ page }) => {
  await page.goto('/dividendes')
  await expect(page.getByRole('heading', { name: 'Dividendes' })).toBeVisible()
  // « Total perçu » est le chiffre héros de l'écran depuis la refonte, plus une carte
  // à en-tête : son libellé est un sur-titre, pas un titre de section.
  const hero = page.locator('div').filter({ hasText: /^Total perçu/ }).last()
  await expect(hero).toBeVisible()
  // Un seul dividende seedé : amount(15) + fee(0) + tax(-2) = 13 € (cf. seed_e2e.py,
  // vérifié contre GET /api/performance -> dividendes_percus).
  await expect(hero.getByText(montantRegex(13, 2))).toBeVisible()
})
