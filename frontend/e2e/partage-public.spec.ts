import { expect, test } from '@playwright/test'
import { montantRegex } from './format'
import { seedData } from './seed-data'

test('Partage : création, consultation publique sans connexion, puis révocation', async ({ page }) => {
  const { attendu } = seedData()
  const nomLien = `E2E lien ${Date.now().toString().slice(-6)}`

  await page.goto('/reglages')
  await page.getByRole('tab', { name: 'Partage' }).click()
  await page.getByLabel('Nom (pour te repérer)').fill(nomLien)
  await page.getByRole('button', { name: 'Créer le lien' }).click()

  const champUrl = page.locator('input[readonly]').first()
  await expect(champUrl).toHaveValue(/\/partage\//)
  const urlPublique = await champUrl.inputValue()
  const token = new URL(urlPublique).pathname.split('/').pop()

  // Simule un visiteur non connecté (efface le jeton local) sans ouvrir un second
  // contexte navigateur — le lien de partage est justement conçu pour être consulté
  // sans compte.
  await page.evaluate(() => window.localStorage.clear())
  await page.goto(`/partage/${token}`)

  await expect(page.getByRole('heading', { name: nomLien })).toBeVisible()
  // "Patrimoine net" seul est ambigu : c'est aussi le libellé d'une des trois
  // statistiques affichées dans la même carte.
  await expect(page.getByRole('heading', { name: 'Patrimoine net' })).toBeVisible()
  await expect(page.getByText(montantRegex(attendu.patrimoine_net)).first()).toBeVisible()

  // Révocation : reconnexion (le jeton local a été effacé ci-dessus), puis
  // vérification que le lien ne fonctionne plus.
  await page.goto('/')
  const { username, password } = seedData()
  await page.getByLabel("Nom d'utilisateur").fill(username)
  await page.getByLabel('Mot de passe').fill(password)
  await page.locator('form').getByRole('button', { name: 'Se connecter' }).click()
  // Attend que la connexion aboutisse avant de naviguer : sans ce garde, `goto`
  // peut interrompre la requête de connexion encore en vol.
  await expect(page.getByRole('navigation', { name: 'Navigation principale' })).toBeVisible()
  await page.goto('/reglages')
  await page.getByRole('tab', { name: 'Partage' }).click()
  await page.locator('li', { has: page.getByText(nomLien) }).getByRole('button', { name: 'Révoquer' }).click()

  await page.evaluate(() => window.localStorage.clear())
  await page.goto(`/partage/${token}`)
  await expect(page.getByText(/révoqué|introuvable|expiré/i)).toBeVisible()
})
