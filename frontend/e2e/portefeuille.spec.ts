import { expect, test } from '@playwright/test'
import { positionsTable } from './helpers'

test.describe('Portefeuille', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/patrimoine')
    await expect(page.getByRole('heading', { name: 'Portefeuille' })).toBeVisible()
  })

  test('liste les positions seedées et filtre par catégorie', async ({ page }) => {
    // Un ticker de position apparaît AUSSI comme <option> du sélecteur "Actif
    // rattaché" d'un emprunt (`LoansCard`, plus bas sur la même page), d'où ce
    // scope explicite au tableau des positions.
    const positions = positionsTable(page)

    // 5 lignes seedées (cf. seed_e2e.py) : E2EAAPL, E2EFUND, E2ENVDA (Actions/ETF),
    // E2E-APPART (Immobilier), E2E-LIVRETA (Épargne).
    await expect(positions.getByText('E2EAAPL')).toBeVisible()
    await expect(positions.getByText('E2EFUND')).toBeVisible()
    await expect(positions.getByText('E2ENVDA')).toBeVisible()
    await expect(positions.getByText('E2E-APPART')).toBeVisible()
    await expect(positions.getByText('E2E-LIVRETA')).toBeVisible()

    await page.getByRole('button', { name: 'Actions' }).click()
    await expect(positions.getByText('E2EAAPL')).toBeVisible()
    await expect(positions.getByText('E2ENVDA')).toBeVisible()
    await expect(positions.getByText('E2EFUND')).not.toBeVisible()
    await expect(positions.getByText('E2E-APPART')).not.toBeVisible()

    await page.getByRole('button', { name: 'Tous' }).click()
    await expect(positions.getByText('E2EFUND')).toBeVisible()
  })

  test('tri par colonne réordonne les lignes', async ({ page }) => {
    const positions = positionsTable(page)
    const premiereLigneTicker = () => positions.locator('tbody tr').first().locator('td').first()

    await positions.getByRole('columnheader', { name: 'Ticker' }).click()
    const premierAsc = await premiereLigneTicker().innerText()

    await positions.getByRole('columnheader', { name: 'Ticker' }).click()
    const premierDesc = await premiereLigneTicker().innerText()

    expect(premierAsc).not.toBe(premierDesc)
  })

  test("ajoute une ligne manuellement, l'édite en ligne puis la supprime", async ({ page }) => {
    const ticker = `E2ETMP${Date.now().toString().slice(-6)}`
    const positions = positionsTable(page)

    // Distinct du formulaire d'ajout d'emprunt de `LoansCard` (plus bas sur la même
    // page), qui a lui aussi un bouton "Ajouter" — seul CE formulaire porte un champ
    // "Ticker".
    const formulaireAjout = page.locator('form').filter({ has: page.getByLabel('Ticker') })
    await formulaireAjout.getByLabel('Ticker').fill(ticker)
    await formulaireAjout.getByLabel('Quantité', { exact: true }).fill('3')
    await formulaireAjout.getByLabel('Prix de revient').fill('10')
    await formulaireAjout.getByRole('button', { name: 'Ajouter', exact: true }).click()

    await expect(positions.getByText(ticker)).toBeVisible()

    // Édition en ligne (LOT 5.8) : modifie la quantité de CETTE ligne temporaire
    // uniquement — jamais une ligne seedée dont d'autres specs dépendent.
    const ligne = positions.locator('tr', { has: page.getByText(ticker) })
    await ligne.getByRole('button', { name: 'Modifier' }).click()
    await page.getByLabel('Quantité (édition)').fill('7')
    await ligne.getByRole('button', { name: 'Enregistrer' }).click()
    await expect(positions.getByText('7', { exact: true }).first()).toBeVisible()

    await ligne.getByRole('button', { name: 'Supprimer' }).click()
    await expect(page.getByRole('heading', { name: 'Supprimer cette ligne ?' })).toBeVisible()
    await page.getByRole('button', { name: 'Supprimer', exact: true }).last().click()
    await expect(page.getByRole('heading', { name: 'Supprimer cette ligne ?' })).not.toBeVisible()
    await expect(positions.getByText(ticker)).not.toBeVisible()
  })

  test('ouvre la fiche détaillée en modale au clic sur une ligne', async ({ page }) => {
    await positionsTable(page).getByText('E2EAAPL').click()
    await expect(page.getByRole('heading', { name: 'E2EAAPL' })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Aperçu' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('heading', { name: 'E2EAAPL' })).not.toBeVisible()
  })
})
