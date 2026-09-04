import { expect, test } from '@playwright/test'

test.describe('Réglages', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/reglages')
    await expect(page.getByRole('heading', { name: 'Réglages' })).toBeVisible()
  })

  test('onglet Détenteurs liste Alice et Bob', async ({ page }) => {
    await page.getByRole('tab', { name: 'Détenteurs' }).click()
    // "Alice"/"Bob" seuls sont ambigus : ce sont aussi des <option> du sélecteur de
    // détenteur du formulaire de quotités plus bas sur le même onglet.
    await expect(page.getByText('Alice (Personne)')).toBeVisible()
    await expect(page.getByText('Bob (Personne)')).toBeVisible()
  })

  test('onglet Comptes & sécurité : crée un membre du foyer, modifie son rôle puis le supprime', async ({ page }) => {
    // Écran d'administration des comptes étendu le 04/09/2026 : origine locale/SSO,
    // dernière connexion, rôle éditable — ce test couvre le cycle complet plutôt que
    // la seule création, désormais qu'il y a plus à vérifier sur la ligne créée.
    await page.getByRole('tab', { name: 'Comptes & sécurité' }).click()
    await expect(page.getByText('Comptes du foyer')).toBeVisible()

    const nomMembre = `e2e_membre_${Date.now().toString().slice(-6)}`
    await page.getByLabel("Nom d'utilisateur").fill(nomMembre)
    await page.getByLabel('Mot de passe', { exact: true }).fill('MembreE2eTest1!')
    await page.getByRole('button', { name: 'Ajouter', exact: true }).click()
    // Scopé à sa propre ligne : le propriétaire connecté apparaît aussi dans cette
    // liste (revue du 04/09/2026) et affiche lui aussi "Connexion locale" en pratique.
    const ligneMembre = page.locator('li').filter({ hasText: nomMembre })
    await expect(ligneMembre).toBeVisible()

    // Créé au mot de passe (pas via SSO) : jamais encore connecté.
    await expect(ligneMembre.getByText('Connexion locale')).toBeVisible()
    await expect(ligneMembre.getByText('Jamais connecté')).toBeVisible()

    const selecteurRole = page.getByLabel(`Rôle de ${nomMembre}`)
    await expect(selecteurRole).toHaveValue('membre')
    await selecteurRole.selectOption('invite')
    // Persisté côté serveur : un rechargement doit conserver la nouvelle valeur, pas
    // seulement l'état local du `<select>`.
    await page.reload()
    await page.getByRole('tab', { name: 'Comptes & sécurité' }).click()
    await expect(page.getByLabel(`Rôle de ${nomMembre}`)).toHaveValue('invite')

    // Nettoyage : ce compte n'existe que pour ce test. Nom du bouton précisé
    // (`aria-label`, `GestionFoyerCard.tsx`) : "Supprimer" seul serait ambigu si un
    // autre membre du foyer existait déjà sur cette instance.
    await page.getByRole('button', { name: `Supprimer le compte ${nomMembre}` }).click()
    await expect(page.getByText(nomMembre)).not.toBeVisible()
  })

  test('onglet Général : préférences de calcul du coût de revient', async ({ page }) => {
    await expect(page.getByText('Méthode de calcul du coût de revient')).toBeVisible()
    await expect(page.getByText('Coût moyen pondéré')).toBeVisible()
  })

  // Assistant de configuration initiale (welcome board) : le compte seedé a déjà
  // `onboarding_termine=true` (cf. `backend/scripts/seed_e2e.py`), donc jamais vu au
  // chargement — ce test couvre uniquement le rejeu depuis Réglages, en conditions
  // réelles de navigateur.
  test('onglet Général : rejoue l\'assistant de bienvenue jusqu\'à sa dernière étape', async ({ page }) => {
    await page.getByRole('button', { name: "Revoir l'assistant de bienvenue" }).click()
    // Scopé au `role="dialog"` de l'assistant : la carte "Assistant de bienvenue" de
    // Réglages, toujours présente dans le DOM derrière l'overlay, matche aussi
    // "Bienvenue" en recherche par sous-chaîne (comportement par défaut de Playwright).
    const assistant = page.getByRole('dialog', { name: 'Assistant de bienvenue' })
    await expect(assistant.getByRole('heading', { name: 'Configuration initiale' })).toBeVisible()
    await expect(assistant.getByRole('heading', { name: 'Bienvenue', exact: true })).toBeVisible()

    await assistant.getByRole('button', { name: 'Suivant' }).click()
    await expect(assistant.getByRole('heading', { name: 'Préférences' })).toBeVisible()
    await assistant.getByRole('button', { name: 'Suivant' }).click()
    await expect(assistant.getByRole('heading', { name: 'Détenteurs du foyer' })).toBeVisible()
    await assistant.getByRole('button', { name: 'Suivant' }).click()
    // Étape "Comptes" (backlog X.3) : établissement seedé (« Banque E2E ») déjà
    // reconnu, même doctrine de rejeu que le reste de l'assistant.
    await expect(assistant.getByRole('heading', { name: 'Comptes', exact: true })).toBeVisible()
    // "Banque E2E" apparaît à plusieurs endroits de cette étape (liste des comptes,
    // `<option>` du sélecteur Établissement) : on cible la ligne de la carte
    // Établissements elle-même via son bouton "Modifier", filtrée par son propre
    // texte — depuis que le seed importe aussi un grand livre multi-comptes (« Trade
    // Republic E2E »), la carte Établissements en liste deux, pas une seule.
    const ligneEtablissement = assistant
      .getByRole('listitem')
      .filter({ has: page.getByRole('button', { name: 'Modifier' }) })
      .filter({ hasText: 'Banque E2E' })
    await expect(ligneEtablissement).toContainText('Banque E2E')
    await assistant.getByRole('button', { name: 'Suivant' }).click()
    await expect(assistant.getByRole('heading', { name: 'Démarrer le portefeuille' })).toBeVisible()
    // Adaptatif à l'état réel (backlog du 2026-09-01) : le compte seedé a déjà des
    // positions (cf. `backend/scripts/seed_e2e.py`) — l'étape doit le reconnaître,
    // jamais suggérer de "commencer à vide" comme sur une instance neuve.
    await expect(assistant.getByText(/compte déjà/)).toBeVisible()
    await expect(assistant.getByText(/commencer à vide/)).not.toBeVisible()
    await assistant.getByRole('button', { name: 'Suivant' }).click()
    await expect(assistant.getByRole('heading', { name: 'Terminé' })).toBeVisible()

    await assistant.getByRole('button', { name: 'Terminer' }).click()
    await expect(assistant).not.toBeVisible()
    await expect(page.getByRole('heading', { name: 'Réglages' })).toBeVisible()
  })
})
