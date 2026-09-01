import { expect, test } from '@playwright/test'

test.describe('Salaire', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/salaire')
    await expect(page.getByRole('heading', { name: 'Salaire', exact: true })).toBeVisible()
  })

  test('affiche les deux entrées seedées', async ({ page }) => {
    await expect(page.getByText('Salaire Alice')).toBeVisible()
    await expect(page.getByText('Salaire Bob')).toBeVisible()
  })

  test('ajoute une nouvelle entrée de salaire', async ({ page }) => {
    const nom = `E2E Salaire ${Date.now().toString().slice(-6)}`
    await page.getByRole('button', { name: '+ Ajouter un salaire' }).click()
    await page.getByLabel('Nom (optionnel)').fill(nom)
    await page.getByLabel('Montant', { exact: true }).fill('1800')
    await page.getByRole('button', { name: 'Ajouter ce salaire' }).click()
    await expect(page.getByText(nom)).toBeVisible()
  })
})
