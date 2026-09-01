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
    // `.text-display` : classe d'échelle typographique réservée au gros chiffre de
    // `PatrimoineNetCard` (backlog 2.K.6) — la même valeur peut coïncidemment
    // apparaître ailleurs sur l'écran (ex. "Valeur des positions"), d'où ce ciblage
    // précis plutôt qu'un `getByText` pleine page.
    const chiffre = page.locator('.text-display')

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
    const chiffre = page.locator('.text-display')
    await expect(chiffre).toHaveText(montantRegex(attendu.patrimoine_net))

    await page.getByRole('button', { name: /masquer les montants/i }).click()
    await expect(chiffre).not.toHaveText(montantRegex(attendu.patrimoine_net))

    // Remet l'état par défaut pour ne pas affecter les specs suivantes (préférence
    // persistée en `localStorage`, partagée entre tous les tests de ce worker).
    await page.getByRole('button', { name: /montants masqués/i }).click()
    await expect(chiffre).toHaveText(montantRegex(attendu.patrimoine_net))
  })

  test('affiche la répartition géographique et sectorielle du portefeuille financier', async ({ page }) => {
    // Section "Détail" ouverte par défaut (`Disclosure`, `defaultOpen=true`) sur un
    // contexte de navigateur fraîchement issu de `storage-state.json` — pas de clic
    // nécessaire pour la révéler.
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
})
