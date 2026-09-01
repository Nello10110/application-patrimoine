import { expect, test } from '@playwright/test'

test.describe('Réglages', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/reglages')
    await expect(page.getByRole('heading', { name: 'Réglages' })).toBeVisible()
  })

  test('onglet Détenteurs liste Alice et Bob', async ({ page }) => {
    await page.getByRole('tab', { name: 'Détenteurs' }).click()
    // "Alice"/"Bob" seuls sont ambigus : ce sont aussi des <option> du sélecteur de
    // détenteur du formulaire de quotités plus bas sur le même onglet.
    await expect(page.getByText('Alice (Personne)')).toBeVisible()
    await expect(page.getByText('Bob (Personne)')).toBeVisible()
  })

  test('onglet Comptes & sécurité : crée un membre du foyer', async ({ page }) => {
    await page.getByRole('tab', { name: 'Comptes & sécurité' }).click()
    await expect(page.getByText('Comptes du foyer')).toBeVisible()

    const nomMembre = `e2e_membre_${Date.now().toString().slice(-6)}`
    await page.getByLabel("Nom d'utilisateur").fill(nomMembre)
    await page.getByLabel('Mot de passe', { exact: true }).fill('MembreE2eTest1!')
    await page.getByRole('button', { name: 'Ajouter', exact: true }).click()
    await expect(page.getByText(nomMembre)).toBeVisible()
  })

  test('onglet Général : préférences de calcul du coût de revient', async ({ page }) => {
    await expect(page.getByText('Méthode de calcul du coût de revient')).toBeVisible()
    await expect(page.getByText('Coût moyen pondéré')).toBeVisible()
  })
})
