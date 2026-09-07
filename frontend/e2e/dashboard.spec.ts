import { expect, test } from '@playwright/test'
import { montantRegex } from './format'
import { cardByTitle } from './helpers'
import { seedData } from './seed-data'

test.describe('Tableau de bord', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Tableau de bord' })).toBeVisible()
  })

  test('affiche le patrimoine net attendu et bascule Net/Brut/Financier', async ({ page }) => {
    const { attendu } = seedData()
    // `.text-heros` : marche de l'échelle typographique réservée au chiffre héros,
    // un seul par écran depuis la refonte (`PatrimoineNetCard`) — la même valeur peut
    // coïncidemment apparaître ailleurs sur l'écran, d'où ce ciblage précis plutôt
    // qu'un `getByText` pleine page.
    const chiffre = page.locator('.text-heros')

    // Lentille "Net" (défaut) : patrimoine net = actifs - passifs (79 000 €, cf.
    // seed_e2e.py — vérifié à la main contre /api/patrimoine/net).
    await expect(chiffre).toHaveText(montantRegex(attendu.patrimoine_net))

    // Lentille "Financier" : ne montre plus que le portefeuille boursier suivi.
    await page.getByRole('button', { name: 'Financier' }).click()
    await expect(chiffre).toHaveText(montantRegex(attendu.valeur_financiere))

    await page.getByRole('button', { name: 'Net', exact: true }).click()
    await expect(chiffre).toHaveText(montantRegex(attendu.patrimoine_net))
  })

  test('bascule "masquer les montants" remplace les chiffres', async ({ page }) => {
    const { attendu } = seedData()
    const chiffre = page.locator('.text-heros')
    await expect(chiffre).toHaveText(montantRegex(attendu.patrimoine_net))

    await page.getByRole('button', { name: /masquer les montants/i }).click()
    await expect(chiffre).not.toHaveText(montantRegex(attendu.patrimoine_net))

    // Remet l'état par défaut pour ne pas affecter les specs suivantes (préférence
    // persistée en `localStorage`, partagée entre tous les tests de ce worker).
    // Le nom accessible est désormais porté par `aria-label` (« Afficher les
    // montants ») : depuis la refonte, le libellé VISIBLE est court (« Masqués »)
    // pour que la barre tienne sur une ligne, cf. `BarreControles.tsx`.
    await page.getByRole('button', { name: /afficher les montants/i }).click()
    await expect(chiffre).toHaveText(montantRegex(attendu.patrimoine_net))
  })

  // Répartitions géographique/sectorielle : elles ont quitté cet écran le
  // 07/09/2026 (« je veux un écran d'accueil un peu plus light ») pour l'onglet
  // Portefeuille d'`Analyse` — la couverture les y suit, cf. `analyse.spec.ts`.
  test("renvoie vers l'écran Analyse, où le détail a été déplacé", async ({ page }) => {
    await expect(page.getByRole('link', { name: /analyse détaillée/ })).toBeVisible()
    await expect(cardByTitle(page, 'Répartition géographique')).toHaveCount(0)
  })
})
