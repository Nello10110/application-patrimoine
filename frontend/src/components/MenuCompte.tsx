import { useEffect, useRef, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { routesDuRang } from '../layout/routes'
import BasculeTheme from './BasculeTheme'
import { IconDeconnexion } from './icons'

// Avatar généré (initiale + couleur dérivée du nom d'utilisateur — déterministe,
// stable d'une connexion à l'autre, pas d'upload d'image).
function couleurAvatar(nom: string): string {
  let hash = 0
  for (const c of nom) hash = (hash * 31 + c.charCodeAt(0)) % 360
  return `hsl(${hash}, 55%, 42%)`
}

/** Menu du compte (backlog 2.K.2 / 2.K.7) : regroupe les écrans d'administration
 * (Import, Réglages, Aide), le thème et la déconnexion derrière un menu qu'il faut
 * ouvrir avant d'agir — corrige le défaut relevé à l'audit UX où l'avatar
 * déconnectait directement au premier clic, sans confirmation ni intention
 * explicite. */
export default function MenuCompte({ compact = false }: { compact?: boolean }) {
  const { user, logout } = useAuth()
  const [ouvert, setOuvert] = useState(false)
  const conteneurRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!ouvert) return
    function onClicExterieur(e: MouseEvent) {
      if (conteneurRef.current && !conteneurRef.current.contains(e.target as Node)) setOuvert(false)
    }
    function onTouche(e: KeyboardEvent) {
      if (e.key === 'Escape') setOuvert(false)
    }
    document.addEventListener('mousedown', onClicExterieur)
    document.addEventListener('keydown', onTouche)
    return () => {
      document.removeEventListener('mousedown', onClicExterieur)
      document.removeEventListener('keydown', onTouche)
    }
  }, [ouvert])

  if (!user) return null
  const initiale = user.username.trim().charAt(0).toUpperCase() || '?'
  // Nom affiché (backlog SSO, claim mapping) : `nom` s'il est renseigné (compte SSO
  // avec un claim mappé), sinon le `username` — jamais l'inverse. L'avatar (initiale
  // + couleur) reste dérivé de `username`, seul champ stable et toujours présent.
  const nomAffiche = user.nom || user.username

  return (
    <div ref={conteneurRef} className="relative">
      <button
        type="button"
        onClick={() => setOuvert((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={ouvert}
        className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-sm text-texte hover:bg-surface-elevee"
      >
        <span
          aria-hidden="true"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
          style={{ backgroundColor: couleurAvatar(user.username) }}
        >
          {initiale}
        </span>
        {!compact && <span className="truncate">{nomAffiche}</span>}
      </button>

      {ouvert && (
        <div
          role="menu"
          aria-label="Menu du compte"
          className="absolute bottom-full left-0 z-10 mb-2 w-56 rounded-lg border border-bordure bg-surface p-1.5 shadow-lg"
        >
          <p className="px-2.5 py-1.5 text-xs font-medium uppercase tracking-wide text-texte-attenue">{nomAffiche}</p>

          {routesDuRang('administration', user.role).map((r) => {
            const Icone = r.icone
            return (
              <NavLink
                key={r.path}
                to={r.path}
                role="menuitem"
                onClick={() => setOuvert(false)}
                className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-texte hover:bg-surface-elevee"
              >
                {Icone && <Icone className="h-4 w-4 text-texte-attenue" />}
                {r.navLabel}
              </NavLink>
            )
          })}

          <div className="my-1 border-t border-bordure" />
          <BasculeTheme />
          <div className="my-1 border-t border-bordure" />

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOuvert(false)
              logout()
            }}
            className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-negatif hover:bg-surface-elevee"
          >
            <IconDeconnexion className="h-4 w-4" />
            Se déconnecter
          </button>
        </div>
      )}
    </div>
  )
}
