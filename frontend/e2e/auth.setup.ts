import { expect, test as setup } from '@playwright/test'
import { STORAGE_STATE_PATH } from '../playwright.config'
import { seedData } from './seed-data'

/** Projet "setup" (cf. `playwright.config.ts`, `dependencies: ['setup']`) : se
 * connecte une seule fois avec le compte seedé et sauvegarde l'état d'authentification
 * (jeton en `localStorage`, cf. `auth/tokenStorage.ts`) — tous les autres fichiers de
 * spec démarrent déjà connectés, sans repasser par le formulaire à chaque fois.
 * `auth.spec.ts` teste le formulaire lui-même en repartant explicitement d'un état
 * vide (`test.use({ storageState: { cookies: [], origins: [] } })`). */
setup('connexion', async ({ page }) => {
  const { username, password } = seedData()
  await page.goto('/')
  await page.getByLabel("Nom d'utilisateur").fill(username)
  await page.getByLabel('Mot de passe').fill(password)
  await page.locator('form').getByRole('button', { name: 'Se connecter' }).click()
  await expect(page.getByRole('navigation', { name: 'Navigation principale' })).toBeVisible()
  await page.context().storageState({ path: STORAGE_STATE_PATH })
})
