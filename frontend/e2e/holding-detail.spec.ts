import { expect, test } from '@playwright/test'
import { montantRegex } from './format'
import { seedData } from './seed-data'

test.describe('Fiche détaillée d\'une position', () => {
  test('E2E-LIVRETA : onglets, historique de valorisation, ajout d\'un point', async ({ page }) => {
    const { holdings } = seedData()
    await page.goto(`/patrimoine/${holdings.livret.ticker}`)
    await expect(page.getByRole('heading', { name: holdings.livret.ticker })).toBeVisible()

    await expect(page.getByRole('tab', { name: 'Aperçu' })).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByText('Historique de valorisation')).toBeVisible()

    await page.getByRole('tab', { name: 'Analyse' }).click()
    await expect(page.getByText('Détenteurs')).toBeVisible()

    await page.getByRole('tab', { name: 'Aperçu' }).click()
    const valeurAvant = (await page.locator('table').first().locator('tbody tr').count())

    await page.getByLabel('Valeur (€)').fill('16000')
    await page.getByLabel('Date').fill(new Date().toISOString().slice(0, 10))
    await page.getByRole('button', { name: 'Ajouter une valorisation' }).click()

    const tableau = page.locator('table').first()
    await expect(page.getByText(montantRegex(16000))).toBeVisible()
    await expect(tableau.locator('tbody tr')).toHaveCount(valeurAvant + 1)

    // Nettoyage : ce point est daté d'AUJOURD'HUI À MINUIT (l'input `type="date"` ne
    // porte pas d'heure), donc *antérieur* dans la journée au point de création du
    // seed (horodatage complet, avec heure) — il ne devient PAS la valeur courante
    // (`set_holding_valorisation` ne remplace jamais un point plus récent déjà
    // connu). Le tableau est trié du plus récent au plus ancien : ce point n'est
    // donc PAS forcément la première ligne — ciblé par sa valeur (16 000 €) plutôt
    // que par position, pour ne jamais supprimer par erreur le point de création du
    // seed (bug réel rencontré : supprimer "la première ligne" supprimait ce
    // point-là, décalant le patrimoine net attendu pour toutes les specs suivantes).
    const ligneAjoutee = tableau.locator('tbody tr').filter({ hasText: montantRegex(16000, 2) })
    await ligneAjoutee.getByRole('button', { name: 'Supprimer' }).click()
    await page.getByRole('button', { name: 'Supprimer', exact: true }).last().click()
    await expect(tableau.locator('tbody tr')).toHaveCount(valeurAvant)

    // Vérifie que la valeur courante n'a jamais bougé (jamais passée à 16 000 €, ni
    // laissée à un état incohérent après la suppression) — pas seulement le nombre
    // de lignes du tableau.
    await expect(page.getByText(montantRegex(seedData().attendu.valeur_livret, 2)).first()).toBeVisible()
  })

  test('E2E-APPART : onglet Paramètres affiche les caractéristiques immobilières', async ({ page }) => {
    const { holdings } = seedData()
    await page.goto(`/patrimoine/${holdings.appartement.ticker}`)
    await expect(page.getByRole('heading', { name: holdings.appartement.ticker })).toBeVisible()
    await expect(page.getByText('Cashflow et rentabilité')).toBeVisible()

    await page.getByRole('tab', { name: 'Paramètres' }).click()
    await expect(page.getByLabel('Loyer mensuel (€)')).toHaveValue('1200')
  })
})
