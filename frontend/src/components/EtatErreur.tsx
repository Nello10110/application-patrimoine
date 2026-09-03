import type { ReactNode } from 'react'

// État d'erreur uniforme (backlog 2.K.1, action de reprise ajoutée en 2.K.5) —
// remplace les `<p className="text-sm text-red-600 dark:text-red-400">{error}</p>`
// répétés à l'identique dans une quarantaine d'endroits. `onReessayer` optionnel :
// absent, le rendu reste strictement celui d'avant.
export default function EtatErreur({ message, onReessayer }: { message: ReactNode; onReessayer?: () => void }) {
  return (
    // `role="alert"` : sans lui, un échec d'enregistrement était TOTALEMENT
    // silencieux pour un lecteur d'écran — l'utilisateur restait sur son
    // formulaire sans savoir que rien n'avait été sauvegardé (revue du
    // 03/09/2026). Posé ici plutôt que sur la quarantaine d'appelants : un seul
    // endroit à tenir, et aucun risque d'en oublier un.
    <div role="alert" className="text-sm text-negatif">
      <p>{message}</p>
      {onReessayer && (
        <button type="button" onClick={onReessayer} className="mt-1 font-medium text-accent hover:underline">
          Réessayer
        </button>
      )}
    </div>
  )
}
