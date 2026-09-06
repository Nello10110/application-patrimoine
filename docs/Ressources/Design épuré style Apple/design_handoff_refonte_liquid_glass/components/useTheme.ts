import { useEffect, useState } from 'react';

type Theme = 'clair' | 'sombre';

const CLE = 'patrimoine.theme';

/**
 * Le thème vit sur <html data-theme>, pas dans un contexte React :
 * tokens-glass.css fait tout le reste, et il n'y a aucun flash au chargement
 * si tu poses aussi l'attribut dans index.html (voir README, étape 1).
 */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    const stocke = localStorage.getItem(CLE);
    if (stocke === 'clair' || stocke === 'sombre') return stocke;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'sombre' : 'clair';
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(CLE, theme);
  }, [theme]);

  return {
    theme,
    setTheme,
    basculer: () => setTheme((t) => (t === 'clair' ? 'sombre' : 'clair')),
  };
}
