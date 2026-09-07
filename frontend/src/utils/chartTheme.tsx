/** Langage graphique unique de la refonte « liquid glass ».
 *
 * Remplace `frontend/src/utils/chartTheme.ts`. Les couleurs de l'original étaient
 * déjà justes — ce fichier ajoute ce qui manquait : les DÉCISIONS DE FORME, pour
 * qu'elles ne soient plus reprises graphique par graphique.
 *
 * ── Le constat qui motive ce fichier ─────────────────────────────────────────
 * Après portage, `PortfolioHistoryChart` (la courbe de la Synthèse) suit la
 * maquette : aucune grille, aucun axe dessiné, un trait d'accent de 2,5 px, une
 * aire dégradée, cinq repères en HTML sous le tracé. Les neuf autres graphiques
 * ont gardé l'allure par défaut de Recharts : grille en pointillés `3 3`, deux axes
 * complets avec graduations. Résultat : la Synthèse respire, et l'écran Analyse
 * ressemble à une planche technique. C'est le même produit avec deux langages.
 *
 * ── La règle ─────────────────────────────────────────────────────────────────
 * Un graphique de cette application raconte une FORME et un ORDRE DE GRANDEUR.
 * La valeur précise s'obtient à l'infobulle, au survol du point voulu — c'est
 * pour cela qu'elle existe. Donc :
 *   • jamais de `CartesianGrid` ;
 *   • un axe n'est dessiné que s'il porte des LIBELLÉS irremplaçables (l'axe des
 *     catégories d'un diagramme en barres). L'axe des valeurs est toujours masqué ;
 *   • une courbe n'a pas d'axe du tout : cinq repères de date en HTML, sous le tracé ;
 *   • pas de point sur une courbe (`dot={false}`), pas d'étiquette sur une part.
 */

/* ── Couleurs (inchangées) ─────────────────────────────────────────────────── */

export const COULEUR_AXE = 'var(--ink4)'
export const COULEUR_ACCENT = 'var(--accent)'

/** Famille unique, du plus au moins important — jamais une palette catégorielle.
 * Au-delà de la cinquième catégorie la teinte ne distingue plus rien : c'est le
 * libellé qui le fait, et les suivantes partagent la dernière valeur. */
export const SERIE = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)', 'var(--s5)']

export function couleurSerie(index: number): string {
  return SERIE[Math.min(index, SERIE.length - 1)]
}

/** Gain / perte. Utiliser CES jetons et non `var(--color-positif)` : ce dernier est
 * le nom généré par Tailwind pour le même jeton, et deux chemins d'indirection pour
 * une seule couleur finissent toujours par diverger. */
export const COULEUR_POSITIF = 'var(--pos)'
export const COULEUR_NEGATIF = 'var(--neg)'

/* ── Formes ────────────────────────────────────────────────────────────────── */

/** Trait d'une courbe. 2,5 px pour la série principale, 1,5 px + pointillés pour un
 * repère (investi, cible, indice de comparaison) : l'épaisseur dit la hiérarchie. */
export const TRAIT_PRINCIPAL = 2.5
export const TRAIT_REPERE = 1.5
export const POINTILLES_REPERE = '5 4'

/** Rayons de barres. L'échelle de la refonte n'a rien entre 0 et 11 px : le
 * `[0, 4, 4, 0]` qui traînait dans cinq graphiques n'appartenait à aucune échelle.
 * Recharts borne le rayon à la demi-épaisseur de la barre — passer la demi-épaisseur
 * visée donne une extrémité en pilule, comme la barre de répartition des maquettes. */
export const RAYON_BARRE_HORIZONTALE: [number, number, number, number] = [0, 12, 12, 0]
export const RAYON_BARRE_VERTICALE: [number, number, number, number] = [7, 7, 0, 0]

/** Hauteurs. Trois marches, pas une valeur par graphique.
 *  • `heros`   — la courbe du bloc principal d'un écran (Synthèse, Objectifs) ;
 *  • `panneau` — un graphique dans un panneau ordinaire ;
 *  • `encart`  — un graphique secondaire, dans une colonne ou une modale.
 * Un diagramme en barres de catégories se calcule plutôt avec `hauteurBarres()`. */
export const HAUTEUR = { heros: 180, panneau: 260, encart: 200 } as const

/** Hauteur d'un diagramme en barres horizontales : 40 px par catégorie (barre de
 * 24 px + 16 px de gouttière), plancher à 200 px pour qu'une seule catégorie ne
 * donne pas un panneau écrasé. */
export function hauteurBarres(nombreCategories: number): number {
  return Math.max(HAUTEUR.encart, nombreCategories * 40)
}

/** Épaisseur d'une barre — fixée, pour qu'un panneau à trois catégories n'affiche
 * pas des barres deux fois plus épaisses qu'un panneau à dix. */
export const EPAISSEUR_BARRE = 24

/* ── Styles Recharts ──────────────────────────────────────────────────────── */

export const STYLE_TICK_AXE = { fill: COULEUR_AXE, fontSize: 12 }

/** Axe de catégories d'un diagramme en barres — le SEUL axe qu'on dessine encore,
 * et sans sa ligne : ce sont les libellés qui servent, pas le trait. */
export const AXE_CATEGORIES = {
  type: 'category' as const,
  axisLine: false,
  tickLine: false,
  stroke: 'none',
  tick: STYLE_TICK_AXE,
}

export const STYLE_INFOBULLE = {
  contentStyle: {
    backgroundColor: 'var(--panel-hi)',
    borderColor: 'var(--stroke)',
    borderRadius: '11px',
    boxShadow: 'var(--shadow)',
    backdropFilter: 'var(--blur)',
  },
  labelStyle: { color: 'var(--ink)' },
  itemStyle: { color: 'var(--ink2)' },
}

/** Survol d'une barre : un voile, pas le gris plein par défaut de Recharts. */
export const CURSEUR_BARRE = { fill: 'var(--hover)' }

/** Légende — 11 px en `--ink3`, comme la légende HTML du mode étagé. La légende
 * intégrée de Recharts reste acceptable pour deux séries nommées (comparaison à un
 * indice) ; au-delà, préférer une légende en HTML sous le graphique, qui s'aligne
 * sur la grille du panneau au lieu de flotter. */
export const STYLE_LEGENDE = { fontSize: 11, color: 'var(--ink3)' }

/** Dégradé d'aire sous une courbe. `id` doit être UNIQUE dans la page : deux
 * graphiques qui déclarent le même `id` de `linearGradient` se volent leur
 * remplissage (le second gagne, en silence). */
export function DegradeAire({ id, couleur = 'var(--accent)' }: { id: string; couleur?: string }) {
  return (
    <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor={couleur} stopOpacity={0.34} />
      <stop offset="100%" stopColor={couleur} stopOpacity={0} />
    </linearGradient>
  )
}
