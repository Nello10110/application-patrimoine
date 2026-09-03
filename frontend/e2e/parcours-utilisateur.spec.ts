import { expect, test } from '@playwright/test'
import { cardByTitle, positionsTable } from './helpers'

/**
 * Recette du 02/09/2026 (demande utilisateur avant démonstration) : simule les
 * ERREURS et incompréhensions réelles d'un utilisateur, pas le parcours nominal
 * — déjà couvert par les autres fichiers de ce dossier.
 *
 * Chaque test répond à « que voit l'utilisateur quand il se trompe ? ». La
 * réponse attendue est toujours la même : un message compréhensible, l'écran
 * intact, et aucune donnée corrompue. Jamais un écran blanc, jamais une trace
 * technique, jamais un doublon silencieux.
 */

test.describe('Parcours dégradés — messages d\'erreur compréhensibles', () => {
  test('créer deux comptes du même nom affiche un message clair, sans casser l\'écran', async ({ page }) => {
    await page.goto('/comptes')
    await expect(page.getByRole('heading', { name: 'Comptes' })).toBeVisible()

    const nom = `Doublon ${Date.now().toString().slice(-6)}`
    const carte = cardByTitle(page, 'Nouveau compte')
    // Établissement obligatoire à la création depuis le 03/09/2026 (revue de
    // qualité) — celui déjà seedé (« Banque E2E »).
    await carte.getByLabel('Établissement').selectOption({ label: 'Banque E2E' })

    await carte.getByPlaceholder('PEA, Livret A...').fill(nom)
    await carte.getByRole('button', { name: '+ Nouveau compte' }).click()
    const groupeBanque = cardByTitle(page, 'Banque E2E')
    await expect(groupeBanque.getByText(nom)).toBeVisible()

    // Deuxième création du même nom : avant correction, cette requête renvoyait
    // une 500 (IntegrityError SQLAlchemy non interceptée). Établissement resélectionné :
    // une création réussie réinitialise tout le formulaire, établissement inclus.
    await carte.getByLabel('Établissement').selectOption({ label: 'Banque E2E' })
    await carte.getByPlaceholder('PEA, Livret A...').fill(nom)
    await carte.getByRole('button', { name: '+ Nouveau compte' }).click()

    await expect(page.getByText(/existe déjà/)).toBeVisible()
    // L'écran reste utilisable et le compte d'origine intact (une seule ligne).
    await expect(page.getByRole('heading', { name: 'Comptes' })).toBeVisible()
    const lignes = groupeBanque.locator('li').filter({ hasText: nom })
    await expect(lignes).toHaveCount(1)

    // Nettoyage : cette spec s'exécute sur la base partagée des autres specs.
    await lignes.getByRole('button', { name: `Supprimer le compte ${nom}`, exact: true }).click()
    await page.getByRole('dialog', { name: 'Supprimer ce compte ?' }).getByRole('button', { name: 'Supprimer' }).click()
    await expect(groupeBanque.getByText(nom)).not.toBeVisible()
  })

  test('créer deux établissements du même nom affiche un message clair', async ({ page }) => {
    // Relocalisée depuis Réglages → onglet Détenteurs le 03/09/2026 (revue de
    // qualité) — `EtablissementsCard` vit désormais sur l'écran Comptes.
    await page.goto('/comptes')
    await expect(page.getByRole('heading', { name: 'Comptes' })).toBeVisible()
    const carte = cardByTitle(page, 'Établissements')

    const nom = `Étab doublon ${Date.now().toString().slice(-6)}`
    await carte.getByPlaceholder("Caisse d'Épargne").fill(nom)
    await carte.getByRole('button', { name: 'Ajouter' }).click()
    await expect(carte.getByText(nom)).toBeVisible()

    await carte.getByPlaceholder("Caisse d'Épargne").fill(nom)
    await carte.getByRole('button', { name: 'Ajouter' }).click()
    await expect(page.getByText(/existe déjà/)).toBeVisible()

    const ligne = carte.locator('li').filter({ hasText: nom })
    await expect(ligne).toHaveCount(1)
    await ligne.getByRole('button', { name: 'Supprimer' }).click()
  })

  test('créer deux détenteurs du même nom est refusé (ils seraient indiscernables)', async ({ page }) => {
    await page.goto('/reglages')
    await page.getByRole('tab', { name: 'Détenteurs' }).click()
    const carte = cardByTitle(page, 'Personnes et sociétés')

    const nom = `Homonyme ${Date.now().toString().slice(-6)}`
    await carte.getByPlaceholder('Alice').fill(nom)
    await carte.getByRole('button', { name: 'Ajouter' }).click()
    await expect(carte.getByText(nom)).toBeVisible()

    await carte.getByPlaceholder('Alice').fill(nom)
    await carte.getByRole('button', { name: 'Ajouter' }).click()
    await expect(page.getByText(/existe déjà/)).toBeVisible()

    const ligne = carte.locator('li').filter({ hasText: nom })
    await expect(ligne).toHaveCount(1)
    await ligne.getByRole('button', { name: 'Supprimer' }).click()
  })
})

test.describe('Parcours dégradés — saisies incohérentes dans le portefeuille', () => {
  // « Ajouter » existe aussi sur la carte Dettes et emprunts, plus bas sur le même
  // écran : tout est scopé au formulaire d'ajout de ligne pour lever l'ambiguïté.
  const formulaireAjout = (page: import('@playwright/test').Page) =>
    cardByTitle(page, 'Ajouter une ligne manuellement')

  test('le bouton Ajouter reste inactif tant que ticker et quantité manquent, et dit ce qui manque', async ({ page }) => {
    await page.goto('/patrimoine')
    await expect(page.getByRole('heading', { name: 'Portefeuille' })).toBeVisible()

    const formulaire = formulaireAjout(page)
    const bouton = formulaire.getByRole('button', { name: 'Ajouter' })

    // Formulaire vierge : bouton inactif ET explication de ce qui est attendu —
    // auparavant le clic ne produisait tout simplement aucun retour.
    await expect(bouton).toBeDisabled()
    await expect(bouton).toHaveAttribute('title', /ticker et une quantité/)

    // Ticker seul : toujours insuffisant.
    await formulaire.getByPlaceholder('AAPL').fill('ZZZTEST')
    await expect(bouton).toBeDisabled()

    // Les deux champs remplis : le bouton devient actif.
    await formulaire.getByLabel('Quantité').fill('1')
    await expect(bouton).toBeEnabled()
  })

  test('une quantité négative est refusée avec un message, la ligne n\'est pas créée', async ({ page }) => {
    await page.goto('/patrimoine')
    await expect(page.getByRole('heading', { name: 'Portefeuille' })).toBeVisible()

    const ticker = `NEG${Date.now().toString().slice(-5)}`
    const formulaire = formulaireAjout(page)
    await formulaire.getByPlaceholder('AAPL').fill(ticker)
    // `type="number"` n'empêche pas la saisie d'un négatif au clavier : c'est bien
    // le backend qui doit refuser, avec un message lisible.
    await formulaire.getByLabel('Quantité').fill('-10')
    await formulaire.getByRole('button', { name: 'Ajouter' }).click()

    await expect(page.getByText(/quantité doit être strictement positive/i)).toBeVisible()
    await expect(page.locator('tbody').getByText(ticker)).not.toBeVisible()
  })
})

test.describe('Ergonomie — le guidage promis est réellement présent à l\'écran', () => {
  test('les trois vues Net/Brut/Financier portent chacune leur explication', async ({ page }) => {
    await page.goto('/')
    for (const [libelle, extrait] of [
      ['Net', /MOINS ce que vous devez/],
      ['Brut', /SANS déduire les emprunts/],
      ['Financier', /Exclut immobilier/],
    ] as const) {
      const bouton = page.getByRole('button', { name: libelle, exact: true })
      await expect(bouton).toHaveAttribute('title', extrait)
    }
  })

  test('le bucket « Sans compte » explique qu\'il n\'est pas un compte', async ({ page }) => {
    // Revue du 03/09/2026 (compte/établissement obligatoires) : le seed ne laisse
    // plus AUCUNE ligne sans compte (E2ENVDA, seule ligne auparavant non
    // rattachée, reçoit désormais un compte automatiquement à l'import du grand
    // livre — cf. `seed_e2e.py`) — un foyer conforme ne peuple plus jamais ce
    // bucket. Seul un actif dispensé de compte (immobilier, véhicule, « autre
    // actif ») peut légitimement y figurer désormais : ce test en crée un pour de
    // vrai plutôt que de dépendre d'un état de seed qui n'existe plus.
    const ticker = `AUTRE${Date.now().toString().slice(-5)}`
    await page.goto('/patrimoine')
    await expect(page.getByRole('heading', { name: 'Portefeuille' })).toBeVisible()
    const formulaire = cardByTitle(page, 'Ajouter une ligne manuellement')
    await formulaire.getByPlaceholder('AAPL').fill(ticker)
    await formulaire.getByLabel('Quantité').fill('1')
    await formulaire.getByLabel('Type d\'actif').selectOption('Autre actif')
    await formulaire.getByRole('button', { name: 'Ajouter' }).click()
    // Scopé à la table des positions : le ticker apparaît aussi comme <option> du
    // sélecteur "Actif rattaché" de la carte des emprunts, plus bas sur la même page.
    const positions = positionsTable(page)
    await expect(positions.getByText(ticker)).toBeVisible()

    await page.goto('/comptes')
    await expect(page.getByRole('heading', { name: 'Comptes' })).toBeVisible()
    await expect(page.getByTitle(/n'est pas un compte/)).toBeVisible()

    // Nettoyage : cette ligne n'existe que pour ce test.
    await page.goto('/patrimoine')
    const ligne = positionsTable(page).locator('tr', { has: page.getByText(ticker) })
    await ligne.getByRole('button', { name: 'Supprimer' }).click()
    await page.getByRole('button', { name: 'Supprimer', exact: true }).last().click()
    await expect(positionsTable(page).getByText(ticker)).not.toBeVisible()
  })

  test('la notion de compte (contenant) est expliquée directement sur l\'écran', async ({ page }) => {
    // Écran Épargne fusionné dans Comptes le 03/09/2026 (demande directe de
    // l'utilisateur) — l'ancienne confusion entre les deux écrans n'existe plus,
    // mais la distinction compte/ligne de patrimoine reste utile à expliquer.
    await page.goto('/comptes')
    await expect(page.getByText(/Qu'est-ce qu'un compte/)).toBeVisible()
    await expect(page.getByTitle(/Un compte est un contenant/)).toBeVisible()
  })

  test('« Part détenue » et « Part nette » sont expliquées sur la fiche d\'un actif', async ({ page }) => {
    await page.goto('/patrimoine/E2EAAPL')
    await page.getByRole('tab', { name: 'Analyse' }).click()
    await expect(page.getByText('Détenteurs')).toBeVisible()

    await expect(page.getByTitle(/SANS déduire l'emprunt/)).toBeVisible()
    await expect(page.getByTitle(/MOINS la part du capital restant dû/)).toBeVisible()
  })
})
