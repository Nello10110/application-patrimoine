import type { Locator, Page } from '@playwright/test'

/** Localise une `Card` (`src/components/Card.tsx`) par son titre — cible sa div
 * racine via sa signature de classes réelle plutôt qu'une heuristique `div` +
 * `.last()` (fragile : `Card` imbrique le titre dans une div interne, sœur du
 * contenu, donc "le dernier div contenant ce texte" ne remonte pas toujours
 * jusqu'à la carte entière). Un titre de carte réapparaît souvent ailleurs sur
 * l'écran (légende de graphique, `<option>` d'un select, autre carte au libellé
 * proche) — scoper via cette fonction avant d'asserter sur le contenu évite
 * systématiquement ces faux positifs. */
export function cardByTitle(page: Page, title: string): Locator {
  return page
    .locator('div.rounded-xl.border.bg-surface')
    .filter({ has: page.getByRole('heading', { name: title, exact: true }) })
}

/** Table des positions de `/patrimoine` (`PositionsTable.tsx`) — identifiée par sa
 * colonne "Ticker", unique à ce tableau (contrairement à `page.locator('table').first()`,
 * qui suppose un ordre de montage dans le DOM non garanti : `LoansCard`, plus bas
 * sur la même page, monte son propre tableau de façon indépendante et peut, selon
 * l'ordre d'arrivée des réponses réseau, se retrouver temporairement premier). */
export function positionsTable(page: Page): Locator {
  return page.locator('table').filter({ has: page.getByRole('columnheader', { name: 'Ticker' }) })
}
