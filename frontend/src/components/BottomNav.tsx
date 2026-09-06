import { NavLink } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { routesDuRang } from '../layout/routes'
import MenuPlusSheet from './MenuPlusSheet'

// Jusqu'à 4 écrans de consultation en accès direct + toujours une entrée "Plus"
// (backlog 2.K.4) : 5 entrées au total pour un rôle complet (propriétaire), moins
// pour un rôle restreint (`routesDuRang` filtre déjà par rôle — un invité n'a que
// Synthèse/Patrimoine en consultation, "Plus" reste utile pour Aide/thème/
// déconnexion même sans écran de consultation supplémentaire à y ranger).
const MAX_ENTREES_DIRECTES = 4

/** Barre de navigation inférieure (backlog 2.K.4, < 768 px) — remplace la barre
 * latérale sur mobile, jamais les deux montées en même temps (`Sidebar` est
 * `hidden md:flex`, ce composant est `md:hidden`). Cibles tactiles ≥ 44 px : la
 * barre fait `h-16` (64 px) et chaque entrée occupe toute la hauteur en `flex-1`.
 *
 * Refonte « liquid glass » (étape 5) : la barre est en verre et le contenu défile
 * DESSOUS (motif iOS) — d'où le `pb-24` du conteneur de contenu dans `App.tsx`, qui
 * empêche la dernière ligne de finir cachée derrière elle. */
export default function BottomNav() {
  const { user } = useAuth()
  const routesConsultation = routesDuRang('consultation', user?.role)
  const directes = routesConsultation.slice(0, MAX_ENTREES_DIRECTES)
  const restantes = routesConsultation.slice(MAX_ENTREES_DIRECTES)

  if (!user) return null

  return (
    <nav
      aria-label="Navigation principale (mobile)"
      className="fixed inset-x-0 bottom-0 z-30 flex h-16 border-t border-stroke bg-panel-hi shadow-[0_-8px_30px_rgba(20,26,40,0.12)] backdrop-blur-glass backdrop-saturate-[1.8] pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {directes.map((r) => {
        const Icone = r.icone
        return (
          <NavLink
            key={r.path}
            to={r.path}
            end={r.path === '/'}
            className={({ isActive }) =>
              `flex min-h-11 flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-medium ${
                isActive ? 'text-accent' : 'text-ink4'
              }`
            }
          >
            {Icone && <Icone className="h-[23px] w-[23px]" />}
            {r.navLabel}
          </NavLink>
        )
      })}

      <MenuPlusSheet routesConsultationRestantes={restantes} />
    </nav>
  )
}
