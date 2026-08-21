import { useTheme, type Theme } from '../hooks/useTheme'

// Bascule discrète du thème (LOT 5.12) : un clic fait cycler clair → sombre →
// système → clair, plutôt que trois boutons séparés. Extrait de `App.tsx` lors du
// passage à la barre latérale (backlog 2.K.2) pour être réutilisable dans le menu
// du compte.
const THEME_SUIVANT: Record<Theme, Theme> = { clair: 'sombre', sombre: 'systeme', systeme: 'clair' }
const THEME_ICONES: Record<Theme, string> = { clair: '☀️', sombre: '🌙', systeme: '🖥️' }
const THEME_LABELS: Record<Theme, string> = { clair: 'Clair', sombre: 'Sombre', systeme: 'Système' }

export default function BasculeTheme({ className = '' }: { className?: string }) {
  const { theme, setTheme } = useTheme()
  return (
    <button
      type="button"
      onClick={() => setTheme(THEME_SUIVANT[theme])}
      title={`Thème : ${THEME_LABELS[theme]} (cliquer pour changer)`}
      aria-label={`Thème : ${THEME_LABELS[theme]}. Cliquer pour changer.`}
      className={`flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm text-texte-attenue hover:bg-surface-elevee ${className}`}
    >
      <span aria-hidden="true">{THEME_ICONES[theme]}</span>
      <span>Thème : {THEME_LABELS[theme]}</span>
    </button>
  )
}
