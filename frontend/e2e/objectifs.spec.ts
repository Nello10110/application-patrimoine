import { expect, test } from '@playwright/test'

test.describe('Objectifs', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/objectifs')
    await expect(page.getByRole('heading', { name: 'Objectifs suivis' })).toBeVisible()
  })

  test("affiche l'objectif seedé avec sa progression", async ({ page }) => {
    await expect(page.getByText("Fonds d'urgence E2E")).toBeVisible()
    // Progression seedée : 15 000 € / 20 000 € = 75 % (cf. seed_e2e.py, vérifié
    // contre GET /api/objectifs/). "75" seul est ambigu (sous-chaîne d'autres
    // montants affichés sur l'écran, ex. "75 988,00 €").
    await expect(page.getByText('75%')).toBeVisible()
  })

  test('crée un nouvel objectif et le retrouve dans la liste', async ({ page }) => {
    const nom = `E2E objectif ${Date.now().toString().slice(-6)}`
    await page.getByLabel('Nom').fill(nom)
    await page.getByLabel('Montant cible (€)').fill('5000')
    await page.getByLabel('Échéance').fill('2030-01-01')
    await page.getByRole('button', { name: "Créer l'objectif" }).click()

    await expect(page.getByText(nom)).toBeVisible()
  })
})
