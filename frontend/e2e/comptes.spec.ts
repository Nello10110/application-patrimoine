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

  test('ouvrir le compte livret affiche sa ligne d\'épargne avec ses actions inline (fusion de l\'écran Épargne, 03/09/2026)', async ({
    page,
  }) => {
    const { attendu, comptes } = seedData()

    await page.getByText(comptes.livret.nom).click()

    const modale = page.getByRole('dialog')
    await expect(modale.getByRole('heading', { name: comptes.livret.nom }).first()).toBeVisible()
    // La ligne d'épargne du compte affiche ses actions directement (pas juste un
    // lien vers sa fiche détaillée), et sa valeur.
    await expect(modale.getByRole('button', { name: 'Modifier' })).toBeVisible()
    await expect(modale.getByRole('button', { name: 'Ajouter une valorisation' })).toBeVisible()
    await expect(modale.getByText(montantRegex(attendu.valeur_livret, 2)).first()).toBeVisible()
  })

  test('cliquer un compte multi-lignes ouvre le détail avec ses lignes et la répartition entre détenteurs', async ({ page }) => {
    const { comptes, holdings } = seedData()

    // `getByRole('button', ...)` plutôt que `getByText` : le nom du compte apparaît
    // désormais aussi dans le graphique/tableau "Plus-value par compte" (revue du
    // 05/09/2026) — seule la ligne cliquable de la liste porte le rôle `button`.
    await page.getByRole('button', { name: new RegExp(`^${comptes.pea.nom}`) }).click()

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

    // Soumission réelle (pas juste l'affichage) : remplace la répartition 60/40
    // seedée par 70/30, confirme le message de succès — prouve que "Enregistrer"
    // appelle bien `PUT /comptes/{id}/quotites` depuis l'IHM. `.last()` sur le
    // bouton : la carte "Informations" plus haut dans la modale a elle aussi son
    // propre bouton "Enregistrer" — celui de la répartition vient après dans le DOM.
    await modale.getByLabel('Alice').fill('70')
    await modale.getByLabel('Bob').fill('30')
    await modale.getByRole('button', { name: 'Enregistrer' }).last().click()
    await expect(modale.getByText('Répartition appliquée à toutes les lignes du compte.')).toBeVisible()
  })

  test('cliquer un compte mono-ligne (immobilier) ouvre le détail avec un renvoi vers sa fiche, et l\'emprunt rattaché', async ({ page }) => {
    const { comptes, holdings, attendu } = seedData()

    // `getByRole('button', ...)` plutôt que `getByText` : le nom du compte apparaît
    // désormais aussi dans le graphique/tableau "Plus-value par compte" (revue du
    // 05/09/2026) — seule la ligne cliquable de la liste porte le rôle `button`.
    await page.getByRole('button', { name: new RegExp(`^${comptes.immobilier.nom}`) }).click()

    const modale = page.getByRole('dialog')
    await expect(modale.getByRole('heading', { name: comptes.immobilier.nom }).first()).toBeVisible()
    await expect(modale.getByText(montantRegex(attendu.valeur_appartement, 2)).first()).toBeVisible()
    await expect(modale.getByRole('link', { name: new RegExp(holdings.appartement.ticker) })).toBeVisible()

    // Emprunt rattaché au bien immobilier de ce compte (backlog X.4) — le seed
    // l'attache via `Loan.holding_id`, purement informatif ici mais annonce que la
    // répartition entre détenteurs ci-dessous s'appliquera aussi à lui.
    await expect(modale.getByRole('heading', { name: 'Emprunts rattachés' })).toBeVisible()
    await expect(modale.getByText('Prêt appartement E2E')).toBeVisible()
    await expect(modale.getByText(/1 ligne, et 1 emprunt rattaché/)).toBeVisible()
  })

  test('cycle complet via l\'IHM : créer un compte avec établissement, le renommer puis le supprimer', async ({ page }) => {
    const nomCompte = `E2E CRUD ${Date.now().toString().slice(-6)}`
    const nomRenomme = `${nomCompte} (renommé)`

    // Établissement obligatoire à la CRÉATION depuis le 03/09/2026 (revue de
    // qualité, compte/établissement obligatoires) — choisi directement dans le
    // formulaire, celui déjà seedé (« Banque E2E »), plutôt qu'un rattachement a
    // posteriori comme avant cette revue.
    const carteNouveauCompte = cardByTitle(page, 'Nouveau compte')
    await carteNouveauCompte.getByPlaceholder('PEA, Livret A...').fill(nomCompte)
    await carteNouveauCompte.getByLabel('Établissement').selectOption({ label: 'Banque E2E' })
    await carteNouveauCompte.getByRole('button', { name: '+ Nouveau compte' }).click()

    const groupeBanque = cardByTitle(page, 'Banque E2E')
    await expect(groupeBanque.getByText(nomCompte)).toBeVisible()

    // Renommage seul : l'établissement est déjà posé, `CompteInfosForm` le garde
    // inchangé. Le compte vient d'être créé sans aucune ligne rattachée : la carte
    // "Répartition entre détenteurs" ne s'affiche pas encore (`QuotitesCompte`,
    // nombreLignes=0), donc "Enregistrer" est ici sans ambiguïté (un seul bouton
    // dans la modale).
    await groupeBanque.getByText(nomCompte).click()
    const modale = page.getByRole('dialog')
    await modale.getByLabel('Nom du compte').fill(nomRenomme)
    await modale.getByRole('button', { name: 'Enregistrer' }).click()

    await expect(modale.getByRole('heading', { name: nomRenomme }).first()).toBeVisible()
    await modale.getByRole('button', { name: 'Fermer' }).click()

    // La liste de `ComptesPage` n'est pas rafraîchie automatiquement à la fermeture
    // de la modale (même comportement que `HoldingDetailModal`/`PortefeuillePage` —
    // pas une régression propre à cet écran) : un rechargement reflète l'état
    // réellement persisté côté serveur, plutôt que de dépendre du cache client.
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Comptes' })).toBeVisible()

    // Le compte renommé reste dans le groupe "Banque E2E" (déjà présent, seedé).
    const groupeBanqueApresRechargement = cardByTitle(page, 'Banque E2E')
    await expect(groupeBanqueApresRechargement.getByText(nomRenomme)).toBeVisible()

    // Suppression : ne touche jamais l'établissement, ni les autres comptes du même
    // groupe (PEA E2E, seedé, doit rester visible).
    // Le bouton NOMME le compte depuis l'audit de design du 03/09/2026 — trois
    // « Supprimer » identiques cohabitaient, indiscernables pour un lecteur d'écran.
    // `exact: true` reste indispensable : la ligne porte elle aussi `role="button"`
    // (cliquable pour ouvrir le détail) et son nom accessible, calculé depuis son
    // contenu, INCLUT désormais l'`aria-label` du bouton — une recherche par
    // sous-chaîne matcherait donc les deux.
    const ligne = groupeBanqueApresRechargement.locator('li').filter({ hasText: nomRenomme })
    await ligne.getByRole('button', { name: `Supprimer le compte ${nomRenomme}`, exact: true }).click()
    // Confirmation obligatoire depuis la recette du 02/09/2026 (le bouton est sur
    // une ligne elle-même cliquable) — la modale rappelle le sort des lignes.
    const confirmation = page.getByRole('dialog', { name: 'Supprimer ce compte ?' })
    await expect(confirmation).toBeVisible()
    await confirmation.getByRole('button', { name: 'Supprimer' }).click()

    await expect(groupeBanqueApresRechargement.getByText(nomRenomme)).not.toBeVisible()
    await expect(groupeBanqueApresRechargement.getByText('PEA E2E')).toBeVisible()
  })

  test('créer un compte sans établissement est refusé (bouton désactivé)', async ({ page }) => {
    // Revue du 03/09/2026, demande directe de l'utilisateur : « il n'est pas
    // possible d'avoir des comptes sans établissement ».
    const carteNouveauCompte = cardByTitle(page, 'Nouveau compte')
    await carteNouveauCompte.getByPlaceholder('PEA, Livret A...').fill('Compte sans étab E2E')

    await expect(carteNouveauCompte.getByRole('button', { name: '+ Nouveau compte' })).toBeDisabled()
  })

  test('crée, renomme puis supprime un établissement (backlog X.1)', async ({ page }) => {
    // Relocalisé depuis Réglages → onglet Détenteurs le 03/09/2026 (revue de
    // qualité) : personne ne pensait chercher la gestion des établissements
    // là-bas — elle vit désormais ici, au-dessus de la création d'un compte.
    const carteEtablissements = cardByTitle(page, 'Établissements')
    const nomEtablissement = `E2E Étab ${Date.now().toString().slice(-6)}`
    const nomRenomme = `${nomEtablissement} (renommé)`

    await carteEtablissements.getByPlaceholder("Caisse d'Épargne").fill(nomEtablissement)
    await carteEtablissements.getByRole('button', { name: 'Ajouter' }).click()
    const ligne = carteEtablissements.locator('li').filter({ hasText: nomEtablissement })
    await expect(ligne).toBeVisible()

    await ligne.getByRole('button', { name: 'Modifier' }).click()
    const champEdition = carteEtablissements.getByLabel('Nom (édition)')
    await champEdition.fill(nomRenomme)
    await carteEtablissements.getByRole('button', { name: 'Enregistrer' }).click()
    const ligneRenommee = carteEtablissements.locator('li').filter({ hasText: nomRenomme })
    await expect(ligneRenommee).toBeVisible()

    await ligneRenommee.getByRole('button', { name: 'Supprimer' }).click()
    await expect(carteEtablissements.getByText(nomRenomme)).not.toBeVisible()
  })
})
