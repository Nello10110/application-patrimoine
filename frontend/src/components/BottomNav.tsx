import { NavLink } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { routesDuRang } from '../layout/routes'
import { IconAnalyse, IconDividendes, IconObjectifs, IconPatrimoine, IconRapport, IconSynthese } from './icons'
import MenuPlusSheet from './MenuPlusSheet'

const ICONES = {
  Synthèse: IconSynthese,
  Patrimoine: IconPatrimoine,
  Analyse: IconAnalyse,
  Objectifs: IconObjectifs,
  Dividendes: IconDividendes,
  Rapport: IconRapport,
} as const

// Jusqu'à 4 écrans de consultation en accès direct + toujours une entrée "Plus"
// (backlog 2.K.4) : 5 entrées au total pour un rôle complet (propriétaire), moins
// pour un rôle restreint (`routesDuRang` filtre déjà par rôle — un invité n'a que
// Synthèse/Patrimoine en consultation, "Plus" reste utile pour Aide/thème/
// déconnexion même sans écran de consultation supplémentaire à y ranger).
const MAX_ENTREES_DIRECTES = 4

/** Barre de navigation inférieure (backlog 2.K.4, < 768 px) — remplace la barre
 * latérale sur mobile, jamais les deux montées en même temps (`Sidebar` est
 * `hidden md:flex`, ce composant est `md:hidden`). Cibles tactiles ≥ 44 px : la
 * barre fait `h-16` (64 px) et chaque entrée occupe toute la hauteur en `flex-1`. */
export default function BottomNav() {
  const { user } = useAuth()
  const routesConsultation = routesDuRang('consultation', user?.role)
  const directes = routesConsultation.slice(0, MAX_ENTREES_DIRECTES)
  const restantes = routesConsultation.slice(MAX_ENTREES_DIRECTES)

  if (!user) return null

  return (
    <nav
      aria-label="Navigation principale (mobile)"
      className="fixed inset-x-0 bottom-0 z-30 flex h-16 border-t border-bordure bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {directes.map((r) => {
        const Icone = r.navLabel ? ICONES[r.navLabel as keyof typeof ICONES] : undefined
        return (
          <NavLink
            key={r.path}
            to={r.path}
            end={r.path === '/'}
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center justify-center gap-0.5 text-xs font-medium ${
                isActive ? 'text-accent' : 'text-texte-attenue'
              }`
            }
          >
            {Icone && <Icone className="h-5 w-5" />}
            {r.navLabel}
          </NavLink>
        )
      })}

      <MenuPlusSheet routesConsultationRestantes={restantes} />
    </nav>
  )
}
