import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { routesDuRang, type RouteMeta } from '../layout/routes'
import BasculeTheme from './BasculeTheme'
import {
  IconAide,
  IconAnalyse,
  IconBudget,
  IconDeconnexion,
  IconDividendes,
  IconImport,
  IconObjectifs,
  IconPlusOptions,
  IconRapport,
  IconReglages,
} from './icons'
import Modale from './Modale'

const ICONES = {
  Analyse: IconAnalyse,
  Objectifs: IconObjectifs,
  Dividendes: IconDividendes,
  Budget: IconBudget,
  Rapport: IconRapport,
  Import: IconImport,
  Réglages: IconReglages,
  Aide: IconAide,
} as const

/** Entrée "Plus" de la barre de navigation inférieure (backlog 2.K.4, mobile) —
 * feuille glissante regroupant les écrans de consultation qui ne tiennent pas dans
 * les 4 entrées directes de `BottomNav`, PLUS ce que `MenuCompte` propose sur
 * desktop (Import/Réglages/Aide, thème, déconnexion). Contenu volontairement
 * dupliqué avec `MenuCompte` plutôt que factorisé : les deux ont un conteneur trop
 * différent (menu ancré vs feuille plein écran) pour partager un seul rendu sans
 * complexifier les deux, et l'un des deux disparaît toujours selon la largeur
 * d'écran (jamais les deux montés en même temps). */
export default function MenuPlusSheet({ routesConsultationRestantes }: { routesConsultationRestantes: RouteMeta[] }) {
  const { user, logout } = useAuth()
  const [ouvert, setOuvert] = useState(false)

  if (!user) return null

  const routesAdministration = routesDuRang('administration', user.role)

  return (
    <>
      <button
        type="button"
        onClick={() => setOuvert(true)}
        aria-haspopup="dialog"
        className="flex flex-1 flex-col items-center justify-center gap-0.5 text-xs font-medium text-texte-attenue"
      >
        <IconPlusOptions className="h-5 w-5" />
        Plus
      </button>

      {ouvert && (
        <Modale
          onClose={() => setOuvert(false)}
          variant="bottom"
          panelClassName="w-full rounded-t-2xl bg-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-xl"
        >
          {() => (
            <div className="space-y-1">
              <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-bordure" aria-hidden="true" />

              {routesConsultationRestantes.map((r) => {
                const Icone = r.navLabel ? ICONES[r.navLabel as keyof typeof ICONES] : undefined
                return (
                  <NavLink
                    key={r.path}
                    to={r.path}
                    onClick={() => setOuvert(false)}
                    className="flex items-center gap-2.5 rounded-md px-2.5 py-3 text-sm font-medium text-texte hover:bg-surface-elevee"
                  >
                    {Icone && <Icone className="h-5 w-5 text-texte-attenue" />}
                    {r.navLabel}
                  </NavLink>
                )
              })}

              {routesConsultationRestantes.length > 0 && routesAdministration.length > 0 && <div className="my-1 border-t border-bordure" />}

              {routesAdministration.map((r) => {
                const Icone = r.navLabel ? ICONES[r.navLabel as keyof typeof ICONES] : undefined
                return (
                  <NavLink
                    key={r.path}
                    to={r.path}
                    onClick={() => setOuvert(false)}
                    className="flex items-center gap-2.5 rounded-md px-2.5 py-3 text-sm font-medium text-texte hover:bg-surface-elevee"
                  >
                    {Icone && <Icone className="h-5 w-5 text-texte-attenue" />}
                    {r.navLabel}
                  </NavLink>
                )
              })}

              <div className="my-1 border-t border-bordure" />
              <BasculeTheme />
              <div className="my-1 border-t border-bordure" />

              <button
                type="button"
                onClick={() => {
                  setOuvert(false)
                  logout()
                }}
                className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-3 text-sm font-medium text-negatif hover:bg-surface-elevee"
              >
                <IconDeconnexion className="h-5 w-5" />
                Se déconnecter
              </button>
            </div>
          )}
        </Modale>
      )}
    </>
  )
}
