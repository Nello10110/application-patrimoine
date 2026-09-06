/** Couleurs de graphiques Recharts partagées, adaptées au mode sombre (LOT 5.12).
 * Recharts prend ses couleurs en props JS, pas en classes Tailwind : on les
 * rattache aux variables CSS définies dans `index.css` (`:root` / `.dark`), que le
 * navigateur réévalue seul quand la classe `.dark` bascule sur `<html>` — sans
 * dépendre du thème courant en JS ni forcer un re-render des graphiques. */

export const COULEUR_GRILLE = 'var(--hairline)'
export const COULEUR_AXE = 'var(--ink4)'

/** Famille unique des graphiques (refonte « liquid glass ») : du plus au moins
 * important, jamais une palette catégorielle arc-en-ciel. Au-delà de la cinquième
 * catégorie, la teinte ne distingue plus rien — c'est le libellé qui le fait, et les
 * suivantes partagent donc la dernière valeur. */
export const SERIE = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)', 'var(--s5)']

export function couleurSerie(index: number): string {
  return SERIE[Math.min(index, SERIE.length - 1)]
}

export const COULEUR_ACCENT = 'var(--accent)'

export const STYLE_TICK_AXE = { fill: COULEUR_AXE }

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
