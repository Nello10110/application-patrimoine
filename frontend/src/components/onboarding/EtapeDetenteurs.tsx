import DetenteursCard from '../DetenteursCard'

/** Étape "Détenteurs du foyer" de `steps.ts` — même raison qu'`EtapePreferences` :
 * réutilise `DetenteursCard` tel quel, liste réellement les détenteurs déjà déclarés
 * (jamais un formulaire vide figé) et permet d'en ajouter/retirer au rejeu. */
export default function EtapeDetenteurs() {
  return (
    <div className="space-y-4">
      <p className="text-sm text-texte">
        Si le patrimoine est partagé (conjoint, société civile...), déclare ici les personnes et sociétés concernées —
        utile pour répartir la propriété des actifs plus tard. Sans objet ? Cette étape se passe sans rien saisir.
      </p>
      <DetenteursCard />
    </div>
  )
}
