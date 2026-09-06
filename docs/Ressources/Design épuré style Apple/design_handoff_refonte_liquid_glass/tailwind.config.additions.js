// tailwind.config.js — à fusionner dans le `theme.extend` existant.
// Les jetons restent en CSS (tokens-glass.css) ; Tailwind ne fait que les exposer
// sous forme d'utilitaires, pour que `bg-panel`, `text-ink3`, `shadow-glass` marchent.

module.exports = {
  darkMode: ['selector', ":root[data-theme='sombre']"],
  theme: {
    extend: {
      colors: {
        ink: 'var(--ink)',
        ink2: 'var(--ink2)',
        ink3: 'var(--ink3)',
        ink4: 'var(--ink4)',
        panel: 'var(--panel)',
        'panel-hi': 'var(--panel-hi)',
        stroke: 'var(--stroke)',
        hairline: 'var(--hairline)',
        chip: 'var(--chip)',
        track: 'var(--track)',
        accent: 'var(--accent)',
        'accent-soft': 'var(--accent-soft)',
        pos: 'var(--pos)',
        'pos-bg': 'var(--pos-bg)',
        neg: 'var(--neg)',
        'neg-bg': 'var(--neg-bg)',
        s1: 'var(--s1)',
        s2: 'var(--s2)',
        s3: 'var(--s3)',
        s4: 'var(--s4)',
        s5: 'var(--s5)',
      },
      borderRadius: {
        // L'échelle de la refonte : rien en dessous de 11px, rien au-dessus de 22px.
        chip: '999px',
        control: '11px',
        card: '18px',
        panel: '20px',
        hero: '22px',
      },
      boxShadow: {
        glass: 'var(--shadow)',
        'glass-lg': 'var(--shadow-lg)',
        accent: 'var(--accent-glow)',
      },
      backdropBlur: {
        glass: '28px',
      },
      fontFamily: {
        // Pile système Apple d'abord : c'est SF Pro sur macOS/iOS, sans rien télécharger.
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"SF Pro Text"',
          '"Helvetica Neue"',
          'Helvetica',
          'system-ui',
          'sans-serif',
        ],
      },
      letterSpacing: {
        hero: '-0.035em',
        title: '-0.025em',
      },
    },
  },
};
