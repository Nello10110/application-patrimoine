import PreferencesCard from '../PreferencesCard'

/** Étape "Préférences" de `steps.ts` — réutilise `PreferencesCard` tel quel (déjà
 * autonome, charge/sauvegarde le réglage réel) : affiche et modifie directement l'état
 * enregistré, aussi bien à la première visite qu'au rejeu depuis Réglages. */
export default function EtapePreferences() {
  return (
    <div className="space-y-4">
      <p className="text-sm text-texte">
        Comment calculer le prix de revient de tes positions boursières lors d'une vente partielle ? Le choix par défaut
        convient à la grande majorité des cas.
      </p>
      <PreferencesCard />
    </div>
  )
}
