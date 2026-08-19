import type { ReactNode } from 'react'

export default function Card({
  title,
  headerActions,
  children,
  className = '',
}: {
  title?: string
  /** Contenu affiché à droite du titre (ex. boutons de bascule d'affichage) — pas de
   * lien avec `title` : si `title` est absent, `headerActions` ne s'affiche pas non
   * plus (aucun cas d'usage actuel n'en a besoin sans titre). */
  headerActions?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <div className={`rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800 ${className}`}>
      {title && (
        <div className="mb-4 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{title}</h2>
          {headerActions}
        </div>
      )}
      {children}
    </div>
  )
}
