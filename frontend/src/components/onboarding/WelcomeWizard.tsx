import { useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import Card from '../Card'
import { ETAPES_ONBOARDING } from './steps'

/** Assistant de configuration initiale (« welcome board »), affiché plein cadre à la
 * place de l'application (cf. `App.tsx` : propriétaire non encore `onboarding_termine`)
 * — même traitement visuel que `LoginPage.tsx` (fond `bg-surface-elevee`, carte
 * centrée), pour la même raison : ni barre latérale ni contenu applicatif tant que ce
 * premier parcours n'est pas terminé.
 *
 * Rejouable depuis Réglages (`ReglagesPage.tsx`, bouton "Revoir l'assistant de
 * bienvenue") via la prop `onClose` : dans ce mode, "Terminer"/"Passer" referment
 * simplement l'assistant sans appeler l'API si `onboarding_termine` est déjà acquis
 * — pure relecture, aucun état serveur modifié une seconde fois. Chaque étape (cf.
 * `steps.tsx`) reflète alors l'état réellement enregistré (préférences, détenteurs,
 * nombre de positions déjà en portefeuille...), jamais un parcours figé comme à la
 * toute première visite. */
export default function WelcomeWizard({ onClose }: { onClose?: () => void }) {
  const { user, completeOnboarding } = useAuth()
  const [index, setIndex] = useState(0)
  const etape = ETAPES_ONBOARDING[index]
  const estDerniereEtape = index === ETAPES_ONBOARDING.length - 1

  async function terminer() {
    if (!user?.onboarding_termine) await completeOnboarding()
    onClose?.()
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-elevee px-6 py-10">
      <div className="w-full max-w-lg">
        <h1 className="mb-2 text-center text-xl font-semibold text-texte">Configuration initiale</h1>
        <p className="mb-6 text-center text-xs text-texte-attenue">
          Étape {index + 1} sur {ETAPES_ONBOARDING.length}
        </p>

        <div className="mb-6 flex justify-center gap-1.5" aria-hidden="true">
          {ETAPES_ONBOARDING.map((e, i) => (
            <span
              key={e.key}
              className={`h-1.5 w-8 rounded-full transition-colors ${i <= index ? 'bg-accent' : 'bg-bordure'}`}
            />
          ))}
        </div>

        <Card title={etape.titre}>
          <div className="min-h-40">
            <etape.Contenu />
          </div>

          <div className="mt-6 flex items-center justify-between border-t border-bordure pt-4">
            <button
              type="button"
              onClick={() => setIndex((i) => i - 1)}
              disabled={index === 0}
              className="rounded-md px-3 py-1.5 text-sm font-medium text-texte-attenue hover:text-texte disabled:opacity-0"
            >
              Précédent
            </button>

            <div className="flex items-center gap-3">
              {!estDerniereEtape && (
                <button
                  type="button"
                  onClick={terminer}
                  className="text-xs text-texte-attenue hover:text-texte hover:underline"
                >
                  Passer l'assistant
                </button>
              )}
              {estDerniereEtape ? (
                <button
                  type="button"
                  onClick={terminer}
                  className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-surface"
                >
                  Terminer
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setIndex((i) => i + 1)}
                  className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-surface"
                >
                  Suivant
                </button>
              )}
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}
