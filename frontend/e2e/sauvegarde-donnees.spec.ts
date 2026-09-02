import { expect, test } from '@playwright/test'
import { cardByTitle } from './helpers'

/**
 * Sauvegarde complète (backlog X.6) : export de toutes les données du foyer, et
 * import qui les remplace. Testé en conditions réelles de navigateur — le
 * téléchargement passe par un `Blob` construit côté client (la route exige
 * l'en-tête d'authentification, qu'une navigation directe ne porterait pas), et
 * l'import est une action destructrice à deux temps.
 *
 * Ces tests s'exécutent sur la base E2E partagée : l'import y étant un
 * REMPLACEMENT, le seul scénario sûr est l'aller-retour avec le fichier qu'on
 * vient d'exporter — il restitue exactement l'état de départ, laissant la base
 * intacte pour les autres specs, quel que soit l'ordre d'exécution.
 */

async function ouvrirCarteSauvegarde(page: import('@playwright/test').Page) {
  await page.goto('/reglages')
  await expect(page.getByRole('heading', { name: 'Réglages' })).toBeVisible()
  const carte = cardByTitle(page, 'Sauvegarde complète des données')
  await expect(carte).toBeVisible()
  return carte
}

test('exporter télécharge un fichier JSON contenant le patrimoine du foyer', async ({ page }) => {
  const carte = await ouvrirCarteSauvegarde(page)

  const [telechargement] = await Promise.all([
    page.waitForEvent('download'),
    carte.getByRole('button', { name: /Exporter mes données/ }).click(),
  ])

  expect(telechargement.suggestedFilename()).toMatch(/patrimoine-export-\d{4}-\d{2}-\d{2}\.json/)

  const flux = await telechargement.createReadStream()
  const morceaux: Buffer[] = []
  for await (const morceau of flux) morceaux.push(morceau as Buffer)
  const document = JSON.parse(Buffer.concat(morceaux).toString('utf-8'))

  expect(document.format).toBe('patrimoine-export')
  // Le foyer seedé contient au moins ses lignes, comptes et détenteurs.
  expect(document.donnees.holdings.length).toBeGreaterThan(0)
  expect(document.donnees.comptes.length).toBeGreaterThan(0)
  expect(document.donnees.detenteurs.length).toBeGreaterThan(0)
  // Rien de sensible ne doit fuiter dans un fichier qui circule.
  expect(document.donnees.users).toBeUndefined()
  expect(document.donnees.auth_tokens).toBeUndefined()
  expect(JSON.stringify(document)).not.toContain('password')
})

test('un fichier étranger est refusé à l\'analyse, sans jamais proposer de remplacer les données', async ({ page }) => {
  const carte = await ouvrirCarteSauvegarde(page)

  await carte.getByLabel('Fichier de sauvegarde à restaurer').setInputFiles({
    name: 'liste-de-courses.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ pain: 1, lait: 2 })),
  })

  await expect(page.getByText(/pas un export de cette application/)).toBeVisible()
  await expect(page.getByRole('dialog')).not.toBeVisible()
})

test('aller-retour complet : exporter puis réimporter restitue le même patrimoine', async ({ page }) => {
  const patrimoineAvant = await page.evaluate(async () => {
    const res = await fetch('/api/patrimoine/net', { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })
    return res.ok ? (await res.json()).patrimoine_net : null
  }).catch(() => null)

  const carte = await ouvrirCarteSauvegarde(page)
  const [telechargement] = await Promise.all([
    page.waitForEvent('download'),
    carte.getByRole('button', { name: /Exporter mes données/ }).click(),
  ])
  const flux = await telechargement.createReadStream()
  const morceaux: Buffer[] = []
  for await (const morceau of flux) morceaux.push(morceau as Buffer)
  const contenu = Buffer.concat(morceaux)

  // L'analyse annonce le contenu AVANT toute modification.
  await carte.getByLabel('Fichier de sauvegarde à restaurer').setInputFiles({
    name: 'export.json',
    mimeType: 'application/json',
    buffer: contenu,
  })
  const confirmation = page.getByRole('dialog', { name: 'Remplacer toutes vos données ?' })
  await expect(confirmation).toBeVisible()
  await expect(confirmation.getByText('lignes de patrimoine')).toBeVisible()
  await expect(confirmation.getByText(/irréversible/)).toBeVisible()

  await confirmation.getByRole('button', { name: 'Remplacer mes données' }).click()
  await expect(page.getByText(/Import terminé/)).toBeVisible({ timeout: 15000 })

  // Le patrimoine est identique à ce qu'il était : l'aller-retour est neutre.
  await page.goto('/comptes')
  await expect(page.getByRole('heading', { name: 'Comptes' })).toBeVisible()
  await expect(cardByTitle(page, 'Banque E2E').getByText('PEA E2E')).toBeVisible()

  await page.goto('/patrimoine')
  await expect(page.getByRole('heading', { name: 'Portefeuille' })).toBeVisible()
  // `.first()` : le ticker figure dans sa propre cellule ET dans le libellé de la
  // ligne (nom du titre issu du cache de cours).
  await expect(page.locator('tbody').getByText('E2EAAPL').first()).toBeVisible()

  if (patrimoineAvant !== null) {
    const patrimoineApres = await page.evaluate(async () => {
      const res = await fetch('/api/patrimoine/net', { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })
      return (await res.json()).patrimoine_net
    })
    expect(patrimoineApres).toBeCloseTo(patrimoineAvant, 2)
  }
})
