/** Couleurs de graphiques Recharts partagées, adaptées au mode sombre (LOT 5.12).
 * Recharts prend ses couleurs en props JS, pas en classes Tailwind : on les
 * rattache aux variables CSS définies dans `index.css` (`:root` / `.dark`), que le
 * navigateur réévalue seul quand la classe `.dark` bascule sur `<html>` — sans
 * dépendre du thème courant en JS ni forcer un re-render des graphiques. */

export const COULEUR_GRILLE = 'var(--color-chart-grid)'
export const COULEUR_AXE = 'var(--color-chart-axis)'

export const STYLE_TICK_AXE = { fill: COULEUR_AXE }

export const STYLE_INFOBULLE = {
  contentStyle: {
    backgroundColor: 'var(--color-tooltip-bg)',
    borderColor: 'var(--color-tooltip-border)',
  },
  labelStyle: { color: 'var(--color-tooltip-text)' },
  itemStyle: { color: 'var(--color-tooltip-text)' },
}
