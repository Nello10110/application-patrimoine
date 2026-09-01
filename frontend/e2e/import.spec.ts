import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import { positionsTable } from './helpers'

const DIRNAME = path.dirname(fileURLToPath(import.meta.url))

test('Import : relevé de positions (CSV, mapping des colonnes)', async ({ page }) => {
  await page.goto('/import')
  await expect(page.getByRole('heading', { name: 'Importer le portefeuille' })).toBeVisible()

  // 4 champs fichier sur cette page (transactions, OFX/QIF, CSV budget, relevé de
  // positions, dans cet ordre) — celui du relevé de positions est le dernier.
  await page.locator('input[type="file"]').last().setInputFiles(path.join(DIRNAME, 'fixtures', 'positions.csv'))

  await expect(page.getByRole('heading', { name: /Aperçu/ })).toBeVisible()
  await page.getByLabel('Colonne Ticker *').selectOption('Symbole')
  await page.getByLabel('Colonne Quantité *').selectOption('Quantite')
  await page.getByLabel('Colonne Prix de revient (optionnel)').selectOption('PRU')
  await page.getByRole('button', { name: "Confirmer l'import" }).click()

  await expect(page.getByText(/1 ligne\(s\) importée/)).toBeVisible()

  await page.goto('/patrimoine')
  // Scope au tableau des positions : le ticker apparaît aussi comme <option> dans
  // le sélecteur "Actif rattaché" de la carte des emprunts, plus bas sur la page.
  const positions = positionsTable(page)
  await expect(positions.getByText('E2EIMPORT')).toBeVisible()

  // Nettoyage : cette ligne n'existe que pour ce test — la laisser fausserait le
  // patrimoine net attendu (seed_e2e.py) pour toutes les specs qui s'exécutent
  // après celle-ci (ex. data-integrity.spec.ts, partage-public.spec.ts).
  const ligne = positions.locator('tr', { has: page.getByText('E2EIMPORT') })
  await ligne.getByRole('button', { name: 'Supprimer' }).click()
  await page.getByRole('button', { name: 'Supprimer', exact: true }).last().click()
  await expect(positions.getByText('E2EIMPORT')).not.toBeVisible()
})
