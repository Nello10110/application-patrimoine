import { expect, test } from '@playwright/test'
import { cardByTitle } from './helpers'

test.describe('Budget', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/budget')
    await expect(page.getByRole('heading', { name: 'Budget' })).toBeVisible()
    // "Annuel" plutôt que "Mensuel" (défaut) : couvre à coup sûr les 3 mois de
    // mouvements seedés (dates relatives à aujourd'hui, cf. seed_e2e.py), sans
    // dépendre d'où tombe la limite de mois au moment où la suite tourne.
    await page.getByRole('button', { name: 'Annuel' }).click()
  })

  test('affiche les indicateurs et la répartition des sorties', async ({ page }) => {
    await expect(page.getByText('Entrées', { exact: true })).toBeVisible()

    // "Logement" apparaît aussi comme <option> de chaque menu de catégorisation ET
    // comme catégorie de la charge récurrente détectée plus bas — scope à la carte
    // de répartition elle-même.
    const carteRepartition = cardByTitle(page, 'Répartition des sorties')
    await expect(carteRepartition.getByRole('cell', { name: 'Logement', exact: true })).toBeVisible()
    // 3 loyers de 1200 € (cf. seed_e2e.py, vérifié contre GET /api/budget/summary).
    await expect(carteRepartition.getByText(/3\s*600(,00)?\s*€/)).toBeVisible()
  })

  test('détecte la charge récurrente du loyer', async ({ page }) => {
    // "Loyer appartement" apparaît aussi 3 fois dans la liste brute des mouvements,
    // en dessous — scope à la carte des récurrences uniquement.
    const carteRecurrences = cardByTitle(page, 'Charges récurrentes et abonnements')
    await expect(carteRecurrences).toBeVisible()
    await expect(carteRecurrences.getByText('Loyer appartement')).toBeVisible()
    await expect(carteRecurrences.getByText('Mensuelle').first()).toBeVisible()
  })

  test('catégorise un mouvement et crée une nouvelle catégorie', async ({ page }) => {
    const mouvement = page.locator('tr', { has: page.getByText('Supermarche Leclerc') }).first()
    await mouvement.getByRole('combobox').selectOption({ label: 'Alimentation' })
    await expect(mouvement.getByRole('combobox')).toHaveValue(/.+/)

    // "Catégories et règles de catégorisation" est un <details>, pas une Card —
    // section repliable dédiée (`CategoriesEtReglesSection.tsx`).
    const section = page.locator('details').filter({ has: page.getByText('Catégories et règles de catégorisation') })
    const nomCategorie = `E2E Catégorie ${Date.now().toString().slice(-6)}`
    await section.getByPlaceholder('Nouvelle catégorie').fill(nomCategorie)
    await section.getByRole('button', { name: 'Ajouter', exact: true }).click()

    // La nouvelle catégorie apparaît À LA FOIS comme puce dans la liste ET comme
    // <option> du sélecteur de règle juste en dessous, dans cette même section —
    // le rôle "listitem" cible spécifiquement la puce.
    await expect(section.getByRole('listitem').filter({ hasText: nomCategorie })).toBeVisible()
  })
})
