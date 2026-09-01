import { expect, test } from '@playwright/test'
import { seedData } from './seed-data'

// Repart d'un état non connecté, contrairement aux autres fichiers de spec (qui
// réutilisent l'état sauvegardé par `auth.setup.ts`) — c'est justement le formulaire
// de connexion lui-même qui est testé ici.
test.use({ storageState: { cookies: [], origins: [] } })

test.describe('Connexion', () => {
  test('affiche une erreur avec de mauvais identifiants', async ({ page }) => {
    await page.goto('/')
    await page.getByLabel("Nom d'utilisateur").fill('e2e_owner')
    await page.getByLabel('Mot de passe').fill('mauvais-mot-de-passe')
    await page.locator('form').getByRole('button', { name: 'Se connecter' }).click()
    await expect(page.getByText("Nom d'utilisateur ou mot de passe incorrect.")).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Navigation principale' })).not.toBeVisible()
  })

  test('connexion réussie affiche le tableau de bord et la session survit à un rechargement', async ({ page }) => {
    const { username, password } = seedData()
    await page.goto('/')
    await page.getByLabel("Nom d'utilisateur").fill(username)
    await page.getByLabel('Mot de passe').fill(password)
    await page.locator('form').getByRole('button', { name: 'Se connecter' }).click()

    await expect(page.getByRole('navigation', { name: 'Navigation principale' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Tableau de bord' })).toBeVisible()

    await page.reload()
    await expect(page.getByRole('navigation', { name: 'Navigation principale' })).toBeVisible()
  })

  test('déconnexion ramène au formulaire de connexion', async ({ page }) => {
    const { username, password } = seedData()
    await page.goto('/')
    await page.getByLabel("Nom d'utilisateur").fill(username)
    await page.getByLabel('Mot de passe').fill(password)
    await page.locator('form').getByRole('button', { name: 'Se connecter' }).click()
    await expect(page.getByRole('navigation', { name: 'Navigation principale' })).toBeVisible()

    // Avatar + nom (`MenuCompte.tsx`) ouvre un menu — la déconnexion exige un clic
    // explicite sur "Se déconnecter" dedans (corrigé par l'audit UX du 30/08/2026,
    // qui a remplacé la déconnexion directe au premier clic sur l'avatar).
    await page.getByRole('button', { name: new RegExp(username, 'i') }).click()
    await page.getByRole('menuitem', { name: 'Se déconnecter' }).click()
    await expect(page.getByLabel("Nom d'utilisateur")).toBeVisible()
  })
})
