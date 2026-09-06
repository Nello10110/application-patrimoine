import type { ReactNode } from 'react'
import { GlassPanel, PanelHeader } from './GlassPanel'

/** Carte de contenu — devenue une simple enveloppe de `GlassPanel` (refonte
 * « liquid glass », étape 2, 05/09/2026).
 *
 * **Sa signature de props n'a pas changé**, et c'est tout l'intérêt : les 49
 * écrans et composants qui l'utilisent passent au verre sans qu'aucun ne soit
 * modifié. Les seuls changements visibles ici sont le fond (verre translucide au
 * lieu du blanc opaque), le rayon (20px au lieu de 12px) et le titre (15px en encre
 * pleine au lieu de petites capitales grises — cf. `PanelHeader`).
 *
 * Le rembourrage interne reste porté par la carte (`p-5` sur le contenu), comme
 * avant : les appelants continuent de fournir des enfants non rembourrés. Un titre
 * fourni pose en revanche un vrai en-tête séparé par un filet, là où l'ancienne
 * carte n'avait qu'une ligne de texte au-dessus du contenu. */
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
    <GlassPanel className={className}>
      {title && <PanelHeader titre={title} action={headerActions} />}
      <div className="p-5">{children}</div>
    </GlassPanel>
  )
}
