import { Link, matchPath, useLocation } from 'react-router-dom'
import { ROUTES } from '../layout/routes'
import { IconChevron } from './icons'

/** Fil d'Ariane (backlog 2.K.2), dérivé de `ROUTES` — même source unique que
 * `useTitreDocument` (`App.tsx`), pour ne jamais désynchroniser URL/libellé/titre
 * d'onglet/fil d'Ariane. N'apparaît pas sur l'accueil (`/`), qui n'a rien au-dessus
 * de lui dans la hiérarchie.
 *
 * Monté en frère de `<Routes>` dans `App.tsx` (pas un descendant d'une `<Route>`) :
 * `useParams()` y renverrait donc toujours `{}`, quelle que soit l'URL réelle. Le
 * ticker est extrait directement du résultat de `matchPath` (fonction pure, ne
 * dépend d'aucun contexte React Router) plutôt que de `useParams()`. */
export default function FilDAriane() {
  const location = useLocation()
  const route = ROUTES.find((r) => matchPath({ path: r.path, end: true }, location.pathname))
  const correspondance = route ? matchPath({ path: route.path, end: true }, location.pathname) : null

  if (!route || route.path === '/') return null

  const segments: { label: string; to?: string }[] = [{ label: 'Synthèse', to: '/' }]
  if (route.path === '/patrimoine/:ticker') {
    segments.push({ label: 'Patrimoine', to: '/patrimoine' })
    // Le ticker vient directement de l'URL (déjà connu, aucun appel réseau
    // supplémentaire nécessaire) — plus lisible que le libellé générique de la
    // route pour cette seule feuille dynamique.
    segments.push({ label: correspondance?.params.ticker ?? route.titre })
  } else {
    segments.push({ label: route.titre })
  }

  return (
    <nav aria-label="Fil d'Ariane" className="flex items-center gap-1.5 px-6 pt-4 text-sm text-texte-attenue">
      {segments.map((segment, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 && <IconChevron className="h-3 w-3 rotate-180" />}
          {segment.to ? (
            <Link to={segment.to} className="hover:text-texte hover:underline">
              {segment.label}
            </Link>
          ) : (
            <span className="font-medium text-texte" aria-current="page">
              {segment.label}
            </span>
          )}
        </span>
      ))}
    </nav>
  )
}
