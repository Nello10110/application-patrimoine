import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import { cardByTitle, positionsTable } from './helpers'

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
  // Colonne Compte mappée (revue du 03/09/2026, compte obligatoire) : sans elle,
  // la ligne importée resterait sans compte et déclencherait l'écran de
  // rattrapage bloquant (`RattrapageComptes.tsx`) à la moindre navigation
  // suivante — plus représentatif de l'usage réel qu'un import volontairement
  // laissé sans compte.
  await page.getByLabel('Compte (optionnel)').selectOption('Compte')
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

test('Import : grand livre multi-comptes (PEA/Compte-titres/Cryptomonnaie/Obligations) demande un établissement', async ({ page }) => {
  // Revue du 03/09/2026, demande directe de l'utilisateur : « il faut qu'à
  // l'import il me demande et remplisse l'établissement, et [...] j'ai une partie
  // PEA, une partie Compte titre, une partie Cryptomonnaie et une partie
  // obligation » — vérifie le flux en deux temps (aperçu puis confirmation) et les
  // 4 comptes créés sous l'établissement choisi.
  await page.goto('/import')
  await expect(page.getByRole('heading', { name: 'Importer le portefeuille' })).toBeVisible()

  // Champ fichier du grand livre : le premier des 4 champs de cette page.
  await page.locator('input[type="file"]').first().setInputFiles(path.join(DIRNAME, 'fixtures', 'transactions.csv'))

  await expect(page.getByText('4 ligne(s) lue(s)')).toBeVisible()
  // Un champ de nom pré-rempli par bucket effectivement présent dans le fichier
  // (association implicite `<label>{nom} ({n} ligne(s))<input/></label>`) — preuve
  // que l'aperçu a bien dérivé les 4 catégories (`cle_compte`).
  await expect(page.getByLabel('PEA (1 ligne)')).toBeVisible()
  await expect(page.getByLabel('Compte-titres (1 ligne)')).toBeVisible()
  await expect(page.getByLabel('Cryptomonnaie (1 ligne)')).toBeVisible()
  await expect(page.getByLabel('Obligations (1 ligne)')).toBeVisible()

  // Suffixe unique : un nom de compte est UNIQUE PAR UTILISATEUR, pas par
  // établissement (`UniqueConstraint(user_id, nom)`) — sans lui, relancer ce test
  // une seconde fois retrouverait les comptes déjà créés par le premier passage
  // (`get_or_create_compte_sans_commit`) au lieu d'en créer 4 nouveaux, et
  // `comptes_crees` retomberait à 0.
  const suffixe = Date.now().toString().slice(-6)
  const nomEtablissement = `E2E Import ${suffixe}`
  const noms = { pea: `PEA ${suffixe}`, titres: `Compte-titres ${suffixe}`, crypto: `Cryptomonnaie ${suffixe}`, obligations: `Obligations ${suffixe}` }
  await page.getByLabel('PEA (1 ligne)').fill(noms.pea)
  await page.getByLabel('Compte-titres (1 ligne)').fill(noms.titres)
  await page.getByLabel('Cryptomonnaie (1 ligne)').fill(noms.crypto)
  await page.getByLabel('Obligations (1 ligne)').fill(noms.obligations)
  await page.getByLabel('Établissement').selectOption({ label: '+ Nouvel établissement...' })
  await page.getByLabel('Nom du nouvel établissement (Établissement)').fill(nomEtablissement)
  await page.getByRole('button', { name: "Confirmer l'import" }).click()

  await expect(page.getByText(/4 transaction\(s\) importée/)).toBeVisible()
  await expect(page.getByText(/4 compte\(s\) créé/)).toBeVisible()

  // Les 4 comptes créés apparaissent groupés sous l'établissement choisi, sous les
  // noms personnalisés saisis à l'aperçu.
  await page.goto('/comptes')
  const groupe = cardByTitle(page, nomEtablissement)
  await expect(groupe.getByText(noms.pea)).toBeVisible()
  await expect(groupe.getByText(noms.titres)).toBeVisible()
  await expect(groupe.getByText(noms.crypto)).toBeVisible()
  await expect(groupe.getByText(noms.obligations)).toBeVisible()

  // Nettoyage : supprime les 4 positions créées (même raison que le test
  // ci-dessus), puis les 4 comptes (désormais vides) et l'établissement — sans ce
  // nettoyage complet, ce test pollue la liste des établissements pour les specs
  // qui la parcourent en entier (ex. le rejeu de l'assistant de bienvenue, cf.
  // `reglages.spec.ts`).
  await page.goto('/patrimoine')
  const positions = positionsTable(page)
  for (const ticker of ['E2EPEA', 'E2ECT', 'E2ECRYPTO', 'E2EBOND']) {
    const ligne = positions.locator('tr', { has: page.getByText(ticker) })
    await ligne.getByRole('button', { name: 'Supprimer' }).click()
    await page.getByRole('button', { name: 'Supprimer', exact: true }).last().click()
    await expect(positions.getByText(ticker)).not.toBeVisible()
  }

  await page.goto('/comptes')
  const groupeAvantSuppression = cardByTitle(page, nomEtablissement)
  for (const nomCompte of [noms.pea, noms.titres, noms.crypto, noms.obligations]) {
    const ligneCompte = groupeAvantSuppression.locator('li').filter({ hasText: nomCompte })
    await ligneCompte.getByRole('button', { name: `Supprimer le compte ${nomCompte}`, exact: true }).click()
    await page.getByRole('dialog', { name: 'Supprimer ce compte ?' }).getByRole('button', { name: 'Supprimer' }).click()
    await expect(groupeAvantSuppression.getByText(nomCompte)).not.toBeVisible()
  }

  const carteEtablissements = cardByTitle(page, 'Établissements')
  const ligneEtablissement = carteEtablissements.locator('li').filter({ hasText: nomEtablissement })
  await ligneEtablissement.getByRole('button', { name: 'Supprimer' }).click()
  await expect(carteEtablissements.getByText(nomEtablissement)).not.toBeVisible()
})
