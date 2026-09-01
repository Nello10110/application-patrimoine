import { expect, test } from '@playwright/test'

test('Rapport : affiche un rapport de période avec les cartes attendues', async ({ page }) => {
  await page.goto('/rapport')
  await expect(page.getByRole('heading', { name: 'Rapport' })).toBeVisible()
  await page.getByRole('button', { name: 'Annuel' }).click()

  await expect(page.getByText('Valeur en fin de période')).toBeVisible()
  await expect(page.getByText('Évolution sur la période')).toBeVisible()
  await expect(page.getByText('Dividendes perçus')).toBeVisible()
})
