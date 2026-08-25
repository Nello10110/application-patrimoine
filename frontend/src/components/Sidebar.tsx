import { Link, NavLink } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useSidebarRepliee } from '../hooks/useSidebarRepliee'
import { routesDuRang } from '../layout/routes'
import {
  IconAnalyse,
  IconBudget,
  IconChevron,
  IconDividendes,
  IconObjectifs,
  IconPatrimoine,
  IconRapport,
  IconSalaire,
  IconSynthese,
} from './icons'
import MenuCompte from './MenuCompte'
import PaletteRecherche from './PaletteRecherche'

const ICONES = {
  Synthèse: IconSynthese,
  Patrimoine: IconPatrimoine,
  Analyse: IconAnalyse,
  Objectifs: IconObjectifs,
  Dividendes: IconDividendes,
  Budget: IconBudget,
  Rapport: IconRapport,
  Salaire: IconSalaire,
} as const

/** Barre latérale verticale repliable (backlog 2.K.2), remplace l'ancien en-tête
 * horizontal à 9 onglets qui ne tenait plus sous ~1000 px de large (audit UX).
 * N'affiche que les écrans de consultation ; les écrans d'administration vivent
 * désormais dans `MenuCompte`. Masquée sous 768 px (backlog 2.K.4) : `BottomNav`
 * la remplace sur mobile, jamais les deux montées en même temps. */
export default function Sidebar() {
  const { repliee, basculer } = useSidebarRepliee()
  const { user } = useAuth()

  return (
    <aside
      className={`hidden h-screen flex-col border-r border-bordure bg-surface transition-[width] duration-150 md:flex ${
        repliee ? 'w-16' : 'w-60'
      }`}
    >
      <div className="flex items-center px-3 py-4">
        <Link
          to="/"
          aria-label="Application Patrimoine"
          className="flex min-w-0 items-center gap-2.5 text-sm font-semibold text-texte"
        >
          <span
            aria-hidden="true"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-accent text-sm font-bold text-surface"
          >
            P
          </span>
          {!repliee && <span className="truncate">Patrimoine</span>}
        </Link>
      </div>

      <div className="px-2 pb-2">
        <PaletteRecherche compact={repliee} />
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2" aria-label="Navigation principale">
        {routesDuRang('consultation', user?.role).map((r) => {
          const Icone = r.navLabel ? ICONES[r.navLabel as keyof typeof ICONES] : undefined
          return (
            <NavLink
              key={r.path}
              to={r.path}
              end={r.path === '/'}
              title={repliee ? r.navLabel : undefined}
              aria-label={repliee ? r.navLabel : undefined}
              className={({ isActive }) =>
                `flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors ${
                  isActive ? 'bg-texte text-surface' : 'text-texte-attenue hover:bg-surface-elevee'
                }`
              }
            >
              {Icone && <Icone className="h-5 w-5 shrink-0" />}
              {!repliee && <span className="truncate">{r.navLabel}</span>}
            </NavLink>
          )
        })}
      </nav>

      <div className="border-t border-bordure px-2 py-2">
        <MenuCompte compact={repliee} />
      </div>

      <button
        type="button"
        onClick={basculer}
        title={repliee ? 'Déplier la barre latérale' : 'Replier la barre latérale'}
        aria-label={repliee ? 'Déplier la barre latérale' : 'Replier la barre latérale'}
        className="flex items-center justify-center gap-2 border-t border-bordure px-2.5 py-2 text-texte-attenue hover:bg-surface-elevee"
      >
        <IconChevron className={`h-4 w-4 transition-transform duration-150 ${repliee ? 'rotate-180' : ''}`} />
        {!repliee && <span className="text-xs">Replier</span>}
      </button>
    </aside>
  )
}
