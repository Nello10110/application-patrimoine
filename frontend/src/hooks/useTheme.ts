import { useCallback, useEffect, useState } from 'react'

export type Theme = 'clair' | 'sombre' | 'systeme'

const CLE_STOCKAGE = 'patrimoine:theme'
const THEMES: Theme[] = ['clair', 'sombre', 'systeme']

function themeValide(valeur: string | null): valeur is Theme {
  return valeur !== null && (THEMES as string[]).includes(valeur)
}

function themeStocke(): Theme {
  if (typeof window === 'undefined') return 'systeme'
  const valeur = window.localStorage.getItem(CLE_STOCKAGE)
  return themeValide(valeur) ? valeur : 'systeme'
}

function requeteSysteme(): MediaQueryList | null {
  if (typeof window === 'undefined' || !window.matchMedia) return null
  return window.matchMedia('(prefers-color-scheme: dark)')
}

function appliquerClasse(sombre: boolean) {
  document.documentElement.classList.toggle('dark', sombre)
}

/** Thème clair/sombre/système (LOT 5.12), persisté dans `localStorage` et appliqué
 * comme classe `dark` sur `<html>` — Tailwind est configuré pour piloter sa variante
 * `dark:` sur cette classe (`@custom-variant dark (&:where(.dark, .dark *));` dans
 * `index.css`), pas seulement sur `prefers-color-scheme` : le choix explicite de
 * l'utilisateur doit primer sur celui du système.
 *
 * En mode "système", suit les changements de préférence du système d'exploitation
 * tant que l'onglet reste ouvert (écouteur sur la media query, nettoyé si le thème
 * change ou au démontage). */
/** Applique le thème stocké, sans exposer de commande de changement.
 *
 * À appeler UNE fois à la racine de l'application. `useTheme` ne vivait jusqu'ici
 * que dans `BasculeTheme`, monté à l'intérieur du menu Compte — lui-même rendu
 * conditionnellement (`{ouvert && ...}`). La classe `dark` n'était donc posée
 * qu'après ouverture du menu : un utilisateur ayant choisi le thème sombre
 * retrouvait l'application en clair à chaque rechargement, jusqu'à rouvrir ce menu
 * (audit de design du 03/09/2026). */
export function useAppliquerTheme(): void {
  useTheme()
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => themeStocke())

  useEffect(() => {
    const media = requeteSysteme()

    function recalculer() {
      const sombre = theme === 'sombre' || (theme === 'systeme' && (media?.matches ?? false))
      appliquerClasse(sombre)
    }

    recalculer()

    if (theme !== 'systeme' || !media) return
    media.addEventListener('change', recalculer)
    return () => media.removeEventListener('change', recalculer)
  }, [theme])

  const setTheme = useCallback((suivant: Theme) => {
    setThemeState(suivant)
    window.localStorage.setItem(CLE_STOCKAGE, suivant)
  }, [])

  return { theme, setTheme }
}
