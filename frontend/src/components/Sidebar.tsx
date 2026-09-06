import { Link, NavLink } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { routesDuRang } from '../layout/routes'
import { GlassPanel } from './GlassPanel'
import MenuCompte from './MenuCompte'
import PaletteRecherche from './PaletteRecherche'

/** Barre latérale verticale (backlog 2.K.2), remplace l'ancien en-tête horizontal à
 * 9 onglets qui ne tenait plus sous ~1000 px de large. N'affiche que les écrans de
 * consultation ; les écrans d'administration vivent dans `MenuCompte`, en pied.
 * Masquée sous 768 px (backlog 2.K.4) : `BottomNav` la remplace sur mobile, jamais
 * les deux montées en même temps.
 *
 * Refonte « liquid glass » (étape 3, 05/09/2026) : panneau de verre à largeur FIXE
 * de 222 px. Le repliage disparaît — décision de design assumée : il coûtait un
 * bouton permanent, un hook d'état persisté et une variante `compact` sur trois
 * composants, pour gagner 96 px sur un écran qui en fait 1280 au minimum. L'item
 * actif porte le dégradé d'accent et son halo ; les inactifs n'ont plus de fond du
 * tout, seulement une encre atténuée. */
export default function Sidebar() {
  const { user } = useAuth()

  return (
    <GlassPanel
      as="aside"
      className="hidden w-[222px] shrink-0 flex-col px-3 py-4 md:flex"
    >
      <div className="flex items-center px-1 pb-3">
        <Link
          to="/"
          aria-label="Application Patrimoine"
          className="flex min-w-0 items-center gap-2.5 text-sm font-semibold text-ink"
        >
          <span
            aria-hidden="true"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-control bg-[image:var(--accent-grad)] text-sm font-bold text-white shadow-accent"
          >
            P
          </span>
          <span className="truncate">Patrimoine</span>
        </Link>
      </div>

      <div className="pb-2">
        <PaletteRecherche />
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto" aria-label="Navigation principale">
        {routesDuRang('consultation', user?.role).map((r) => {
          const Icone = r.icone
          return (
            <NavLink
              key={r.path}
              to={r.path}
              end={r.path === '/'}
              className={({ isActive }) =>
                `flex items-center gap-2.5 rounded-control px-2.5 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-[image:var(--accent-grad)] text-white shadow-accent'
                    : 'text-ink2 hover:bg-hover hover:text-ink'
                }`
              }
            >
              {Icone && <Icone className="h-5 w-5 shrink-0" />}
              <span className="truncate">{r.navLabel}</span>
            </NavLink>
          )
        })}
      </nav>

      <div className="mt-2 border-t border-hairline pt-2">
        <MenuCompte />
      </div>
    </GlassPanel>
  )
}
