import { useAuth } from '../../hooks/useAuth'

/** Étape "Bienvenue" de `steps.ts` — cf. son commentaire d'en-tête : le message
 * s'adapte selon que l'assistant est joué pour la première fois ou rejoué depuis
 * Réglages (`user.onboarding_termine` déjà acquis). */
export default function EtapeBienvenue() {
  const { user } = useAuth()
  const rejeu = user?.onboarding_termine ?? false

  return (
    <div className="space-y-3 text-sm text-texte">
      {rejeu ? (
        <p>
          Retour sur le parcours de configuration initiale — chaque étape suivante affiche ce qui est déjà enregistré
          (préférences, détenteurs, portefeuille) : rien n'est rejoué à vide, tu peux compléter ou corriger ce qui manque.
        </p>
      ) : (
        <p>
          Cette application suit ton patrimoine dans son ensemble : portefeuille boursier, immobilier, épargne, budget,
          objectifs. Quelques réglages de départ permettent de l'adapter à ta situation — ça prend deux minutes.
        </p>
      )}
      <p className="text-texte-attenue">
        Chaque étape peut être passée et modifiée plus tard depuis Réglages, y compris cet assistant lui-même (bouton
        "Revoir l'assistant de bienvenue" dans l'onglet Général).
      </p>
    </div>
  )
}
