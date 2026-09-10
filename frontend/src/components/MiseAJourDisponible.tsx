import { createPortal } from 'react-dom'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { PrimaryButton, SecondaryButton } from './Controls'

// Un déploiement peut survenir n'importe quand pendant qu'un onglet reste ouvert
// (retour utilisateur du 10/09/2026 : le bouton de connexion SSO disparaissait
// après une longue période d'inactivité, l'onglet ayant manqué toute vérification
// d'une éventuelle nouvelle version) — sans vérification active, le service worker
// ne se met à jour qu'au hasard d'une navigation complète (Chrome/Firefox
// vérifient au chargement, puis au mieux une fois par 24 h tant que l'onglet
// reste actif). Une heure est un compromis raisonnable : assez rapproché pour
// qu'un onglet resté ouvert des jours ne rate jamais un déploiement bien
// longtemps, assez espacé pour ne jamais peser sur le réseau.
const INTERVALLE_VERIFICATION_MS = 60 * 60 * 1000

/** Invite au rechargement après un déploiement (retour utilisateur du 10/09/2026 :
 * « une pop-up invitant l'utilisateur à appuyer sur un bouton [...] pour être sûr
 * que toute l'application est rechargée ») — monté une seule fois, dans `App.tsx`,
 * couvrant aussi bien l'écran de connexion que l'application authentifiée.
 *
 * `registerType: "prompt"` (`vite.config.ts`) : contrairement à l'ancien
 * "autoUpdate", le service worker fraîchement téléchargé n'active JAMAIS tout
 * seul — `updateServiceWorker()` ci-dessous est le seul déclencheur, toujours au
 * clic sur « Recharger ». Sans ce composant, la nouvelle version restait
 * silencieusement en attente jusqu'à la PROCHAINE navigation complète (parfois
 * jamais, pour un onglet resté ouvert) : c'est exactement ce qui faisait
 * disparaître le bouton de connexion SSO — l'onglet tournait encore sur le code
 * JS d'une version antérieure, sans le moindre signe visible du problème.
 *
 * Portail vers `document.body` (même raison que `Modale.tsx`) : `position: fixed`
 * sur un descendant d'un ancêtre `backdrop-filter` devient relatif À CET ANCÊTRE,
 * pas à la fenêtre — sans portail, une bannière posée n'importe où dans l'arbre
 * pourrait un jour se retrouver enfermée derrière un panneau de verre. */
export default function MiseAJourDisponible() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return
      setInterval(() => {
        void registration.update()
      }, INTERVALLE_VERIFICATION_MS)
    },
  })

  if (!needRefresh) return null

  return createPortal(
    <div
      role="status"
      className="fixed inset-x-4 bottom-4 z-50 mx-auto flex w-fit max-w-[calc(100vw-2rem)] flex-wrap items-center gap-3 rounded-panel border border-stroke bg-panel-hi px-4 py-3 text-sm text-ink shadow-glass-lg backdrop-blur-glass"
    >
      <span>Une nouvelle version de l'application est disponible.</span>
      <div className="flex gap-2">
        <PrimaryButton onClick={() => void updateServiceWorker(true)}>Recharger</PrimaryButton>
        <SecondaryButton onClick={() => setNeedRefresh(false)}>Plus tard</SecondaryButton>
      </div>
    </div>,
    document.body,
  )
}
