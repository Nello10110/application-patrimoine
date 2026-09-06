import type { ReactNode } from 'react'

type Niveau = 'panel' | 'hero'

/** Panneau de verre — la surface unique de la refonte (paquet de design du
 * 05/09/2026, étape 2). Remplace le `rounded-xl border border-bordure bg-surface
 * shadow-sm` de l'ancienne `Card`, qui reste son enveloppe historique (`Card.tsx`)
 * pour que tous les écrans basculent sans être réécrits.
 *
 * `hero` est réservé au bloc principal d'un écran — UN SEUL par écran, c'est la
 * règle qui porte toute la hiérarchie de la refonte ; `panel` pour tout le reste. */
export function GlassPanel({
  children,
  niveau = 'panel',
  className = '',
  as: Tag = 'div',
}: {
  children: ReactNode
  niveau?: Niveau
  className?: string
  as?: 'div' | 'section' | 'aside'
}) {
  const fond = niveau === 'hero' ? 'bg-panel-hi shadow-glass-lg' : 'bg-panel shadow-glass'
  const rayon = niveau === 'hero' ? 'rounded-hero' : 'rounded-panel'
  return (
    <Tag className={`${rayon} ${fond} border border-stroke backdrop-blur-glass backdrop-saturate-[1.8] ${className}`}>
      {children}
    </Tag>
  )
}

/** En-tête de panneau : titre en 15px/600 en encre pleine, plus les petites
 * capitales gris clair de l'ancienne `Card` — qui donnaient à chaque section le
 * même poids, donc aucun.
 *
 * Écart assumé au fichier livré par le paquet, qui utilisait un `<p>` : le titre
 * reste un `<h2>`. C'est un repère de structure pour un lecteur d'écran (et le
 * point d'ancrage de toute la suite de tests), et l'apparence ne dépend pas de la
 * balise. */
export function PanelHeader({ titre, action }: { titre: string; action?: ReactNode }) {
  return (
    <div className="flex items-center gap-3 border-b border-hairline px-5 py-3.5">
      <h2 className="m-0 text-[15px] font-semibold -tracking-[0.01em] text-ink">{titre}</h2>
      {action ? <div className="ml-auto">{action}</div> : null}
    </div>
  )
}

/** Ligne de liste — le motif unique pour comptes, mouvements, dividendes, jalons. */
export function PanelRow({
  children,
  onClick,
  derniere = false,
}: {
  children: ReactNode
  onClick?: () => void
  derniere?: boolean
}) {
  const base = `flex w-full items-center gap-3 px-5 py-3 text-left ${derniere ? '' : 'border-b border-hairline'}`
  if (!onClick) return <div className={base}>{children}</div>
  return (
    <button type="button" onClick={onClick} className={`${base} hover:bg-hover`}>
      {children}
    </button>
  )
}
