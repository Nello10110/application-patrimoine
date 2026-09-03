import { expect, test, type ConsoleMessage, type Page } from '@playwright/test'
import { seedData } from './seed-data'

/**
 * Balayage systématique de TOUS les écrans (recette du 02/09/2026) : pour chacun,
 * on vérifie les trois choses qu'aucun test fonctionnel ne vérifie explicitement
 * et qui sautent pourtant aux yeux en démonstration —
 *
 *   1. l'écran s'affiche (titre attendu présent, donc pas de page blanche ni de
 *      composant qui a levé pendant son rendu) ;
 *   2. aucune erreur console (une exception React avalée par un `catch`, un
 *      `key` manquant, un appel réseau en échec silencieux s'y voient) ;
 *   3. aucune trace technique visible par l'utilisateur.
 *
 * Volontairement générique et sans assertion métier : c'est le filet de sécurité
 * « rien n'est cassé nulle part », complémentaire des specs par écran.
 */

/** `titre` = celui déclaré dans `layout/routes.ts` (source unique de vérité, qui
 * pilote `document.title` et le fil d'Ariane) — volontairement PAS le `<h2>` de la
 * page : plusieurs écrans ont un titre de contenu différent de leur libellé de
 * navigation (« Objectifs » affiche « Simulateur » sous ses objectifs suivis,
 * « Import » affiche « Importer le portefeuille »), ce qui est un choix
 * d'affichage, pas une anomalie. */
const ROUTES_A_BALAYER: { chemin: string; titre: string }[] = [
  { chemin: '/', titre: 'Synthèse' },
  { chemin: '/patrimoine', titre: 'Patrimoine' },
  { chemin: '/comptes', titre: 'Comptes' },
  { chemin: '/objectifs', titre: 'Objectifs' },
  { chemin: '/dividendes', titre: 'Dividendes' },
  { chemin: '/budget', titre: 'Budget' },
  { chemin: '/rapport', titre: 'Rapport' },
  { chemin: '/salaire', titre: 'Salaire' },
  { chemin: '/import', titre: 'Import' },
  { chemin: '/reglages', titre: 'Réglages' },
  { chemin: '/aide', titre: 'Aide' },
]

/** Bruit console attendu, hors du champ de ce filet de sécurité : messages émis
 * par l'environnement de test ou par des bibliothèques tierces, jamais par le code
 * applicatif. Toute NOUVELLE entrée ici doit être justifiée — c'est exactement le
 * mécanisme par lequel un vrai bug finirait masqué. */
const BRUIT_CONSOLE_ATTENDU = [
  /Download the React DevTools/,
  // Recharts mesure ses conteneurs après montage ; en headless la largeur initiale
  // est parfois 0, d'où cet avertissement sans conséquence sur le rendu final.
  /width\(0\) and height\(0\) of chart should be greater than 0/,
]

function collecterErreursConsole(page: Page): string[] {
  const erreurs: string[] = []
  page.on('console', (message: ConsoleMessage) => {
    if (message.type() !== 'error' && message.type() !== 'warning') return
    const texte = message.text()
    if (BRUIT_CONSOLE_ATTENDU.some((motif) => motif.test(texte))) return
    erreurs.push(`[${message.type()}] ${texte}`)
  })
  page.on('pageerror', (err) => erreurs.push(`[pageerror] ${err.message}`))
  return erreurs
}

for (const { chemin, titre } of ROUTES_A_BALAYER) {
  test(`${chemin} s'affiche sans erreur console ni trace technique`, async ({ page }) => {
    const erreurs = collecterErreursConsole(page)

    await page.goto(chemin)

    // Titre d'onglet piloté par `routes.ts` : présent = la route a bien été
    // résolue et le composant de page monté (une page qui lève pendant son rendu
    // ne l'atteint jamais).
    await expect(page).toHaveTitle(new RegExp(titre))
    // Contenu réellement rendu, pas un cadre vide.
    await expect(page.locator('main')).not.toBeEmpty()
    await expect(page.locator('main').getByRole('heading').first()).toBeVisible()

    // Aucune trace technique ne doit fuiter jusqu'à l'utilisateur.
    await expect(page.getByText(/Traceback|Internal Server Error|\[object Object\]|NaN\s?€|undefined/)).not.toBeVisible()

    expect(erreurs, `Erreurs console sur ${chemin} :\n${erreurs.join('\n')}`).toEqual([])
  })
}

test('les fiches détaillées (position, compte) s\'affichent sans erreur console', async ({ page }) => {
  const { holdings, comptes } = seedData()
  const erreurs = collecterErreursConsole(page)

  await page.goto(`/patrimoine/${holdings.appartement.ticker}`)
  await expect(page.getByRole('heading', { name: holdings.appartement.ticker })).toBeVisible()
  // Les trois onglets de la fiche, chacun montant des composants distincts.
  for (const onglet of ['Analyse', 'Paramètres', 'Aperçu']) {
    await page.getByRole('tab', { name: onglet }).click()
    await expect(page.getByRole('tab', { name: onglet })).toHaveAttribute('aria-selected', 'true')
  }

  await page.goto(`/comptes/${comptes.pea.id}`)
  await expect(page.getByRole('heading', { name: comptes.pea.nom }).first()).toBeVisible()

  expect(erreurs, `Erreurs console sur les fiches détaillées :\n${erreurs.join('\n')}`).toEqual([])
})

test('une URL inconnue et une fiche inexistante ne laissent jamais un écran blanc', async ({ page }) => {
  await page.goto('/chemin/qui-nexiste-pas')
  // Quel que soit le traitement retenu (redirection ou page dédiée), l'utilisateur
  // doit voir une interface, jamais un cadre vide.
  await expect(page.locator('nav').first()).toBeVisible()

  await page.goto('/patrimoine/TICKER-INEXISTANT-XYZ')
  await expect(page.locator('body')).not.toHaveText('')
  await expect(page.getByText(/Traceback|Internal Server Error/)).not.toBeVisible()

  await page.goto('/comptes/999999')
  await expect(page.locator('body')).not.toHaveText('')
  await expect(page.getByText(/Traceback|Internal Server Error/)).not.toBeVisible()
})
