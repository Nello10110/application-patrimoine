import { expect, test } from '@playwright/test'
import { montantRegex } from './format'
import { cardByTitle } from './helpers'

test('Dividendes : affiche le total perçu seedé', async ({ page }) => {
  await page.goto('/dividendes')
  await expect(page.getByRole('heading', { name: 'Dividendes' })).toBeVisible()
  const carteTotal = cardByTitle(page, 'Total perçu')
  await expect(carteTotal).toBeVisible()
  // Un seul dividende seedé : amount(15) + fee(0) + tax(-2) = 13 € (cf. seed_e2e.py,
  // vérifié contre GET /api/performance -> dividendes_percus).
  await expect(carteTotal.getByText(montantRegex(13, 2))).toBeVisible()
})
