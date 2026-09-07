import { expect, test } from '@playwright/test'
import { montantRegex } from './format'
import { cardByTitle } from './helpers'

/** Écran « Analyse » (réorganisation du 07/09/2026) : reprend le repli « Détail »
 * du tableau de bord (onglet Portefeuille) et l'ancien écran Dividendes (onglet
 * Revenus). Ce fichier remplace `dividendes.spec.ts` et la partie « répartitions »
 * de `dashboard.spec.ts`. */
test.describe('Analyse', () => {
  test('onglet Portefeuille : répartitions géographique et sectorielle du portefeuille financier', async ({ page }) => {
    await page.goto('/analyse')
    await expect(page.getByRole('heading', { name: 'Analyse', level: 1 })).toBeVisible()

    const carteGeo = cardByTitle(page, 'Répartition géographique')
    const carteSecteur = cardByTitle(page, 'Répartition sectorielle')
    await expect(carteGeo).toBeVisible()
    await expect(carteSecteur).toBeVisible()

    // Seed : 91% Amérique du Nord / 9% Europe (cf. seed_e2e.py, vérifié contre
    // /api/analysis), 100% Technologies de l'information. `.first()` : le libellé
    // apparaît à la fois dans la liste et dans la légende du graphique (recharts).
    await expect(carteGeo.getByText('Amérique du Nord').first()).toBeVisible()
    // Sous-chaîne plutôt que le libellé complet : les étiquettes longues de l'axe du
    // graphique en barres (recharts) s'enroulent sur plusieurs lignes SVG (`tspan`
    // distincts), donc "Technologies de l'information" en un seul nœud de texte ne
    // s'y trouve pas forcément.
    await expect(carteSecteur.getByText(/Technologies/).first()).toBeVisible()
  })

  test('onglet Revenus : affiche le total de dividendes seedé', async ({ page }) => {
    await page.goto('/analyse')
    await page.getByRole('tab', { name: /Revenus/ }).click()

    const hero = page.locator('div').filter({ hasText: /^Dividendes perçus/ }).last()
    await expect(hero).toBeVisible()
    // Un seul dividende seedé : amount(15) + fee(0) + tax(-2) = 13 € (cf. seed_e2e.py,
    // vérifié contre GET /api/performance -> dividendes_percus).
    await expect(hero.getByText(montantRegex(13, 2))).toBeVisible()
  })

  test("l'ancienne URL /dividendes mène à l'onglet Revenus", async ({ page }) => {
    await page.goto('/dividendes')

    await expect(page).toHaveURL(/\/analyse\?onglet=revenus/)
    await expect(page.getByRole('tab', { name: /Revenus/ })).toHaveAttribute('aria-selected', 'true')
  })
})
