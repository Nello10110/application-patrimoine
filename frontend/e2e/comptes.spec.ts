import { expect, test } from '@playwright/test'
import { montantRegex } from './format'
import { cardByTitle } from './helpers'
import { seedData } from './seed-data'

test.describe('Comptes (backlog X.1)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/comptes')
    await expect(page.getByRole('heading', { name: 'Comptes' })).toBeVisible()
  })

  test('groupe les comptes par établissement, et le compte immobilier apparaît "Sans établissement"', async ({ page }) => {
    const { attendu, comptes } = seedData()

    // "Banque E2E" (établissement seedé) contient le compte "PEA E2E" (2 lignes,
    // AAPL + FUND) — cf. seed_e2e.py.
    const groupeBanque = cardByTitle(page, 'Banque E2E')
    await expect(groupeBanque).toBeVisible()
    await expect(groupeBanque.getByText(comptes.pea.nom)).toBeVisible()
    await expect(groupeBanque.getByText('2 lignes')).toBeVisible()

    // Le compte immobilier et le livret n'ont pas d'établissement rattaché — groupe
    // "Sans établissement", solde = valeur de l'appartement seedé.
    const groupeSansEtablissement = cardByTitle(page, 'Sans établissement')
    await expect(groupeSansEtablissement).toBeVisible()
    await expect(groupeSansEtablissement.getByText(comptes.immobilier.nom)).toBeVisible()
    await expect(groupeSansEtablissement.getByText(comptes.livret.nom)).toBeVisible()
    const ligneImmobilier = groupeSansEtablissement.locator('li').filter({ hasText: comptes.immobilier.nom })
    await expect(ligneImmobilier.getByText(montantRegex(attendu.valeur_appartement, 2))).toBeVisible()
  })

  test('cliquer un compte multi-lignes ouvre le détail avec ses lignes et la répartition entre détenteurs', async ({ page }) => {
    const { comptes, holdings } = seedData()

    await page.getByText(comptes.pea.nom).click()

    const modale = page.getByRole('dialog')
    // `.first()` : le nom du compte apparaît deux fois dans la modale — le titre
    // accessible du dialogue (`Modale.tsx`, `aria-labelledby`) ET le titre visible du
    // contenu (`CompteDetailContent`), même patron que `HoldingDetailModal.tsx`.
    await expect(modale.getByRole('heading', { name: comptes.pea.nom }).first()).toBeVisible()
    await expect(modale.getByText(holdings.aapl.ticker)).toBeVisible()
    await expect(modale.getByText(holdings.fund.ticker)).toBeVisible()

    // Répartition entre détenteurs pour tout le compte (cœur de la demande :
    // définie une fois pour les 2 lignes plutôt que ligne par ligne) — le seed a
    // déjà posé 60/40 Alice/Bob au niveau du compte (`_repartir_quotites_compte`).
    await expect(modale.getByRole('heading', { name: 'Répartition entre détenteurs' })).toBeVisible()
    await expect(modale.getByText(/S'applique à TOUTES les lignes de ce compte/)).toBeVisible()
  })

  test('cliquer un compte mono-ligne (immobilier) ouvre le détail avec un renvoi vers sa fiche', async ({ page }) => {
    const { comptes, holdings, attendu } = seedData()

    await page.getByText(comptes.immobilier.nom).click()

    const modale = page.getByRole('dialog')
    await expect(modale.getByRole('heading', { name: comptes.immobilier.nom }).first()).toBeVisible()
    await expect(modale.getByText(montantRegex(attendu.valeur_appartement, 2)).first()).toBeVisible()
    await expect(modale.getByRole('link', { name: new RegExp(holdings.appartement.ticker) })).toBeVisible()
  })
})
