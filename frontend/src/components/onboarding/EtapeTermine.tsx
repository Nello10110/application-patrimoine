import { useAuth } from '../../hooks/useAuth'

/** Étape "Terminé" de `steps.ts` — message final adapté lui aussi au rejeu, même
 * logique qu'`EtapeBienvenue`. */
export default function EtapeTermine() {
  const { user } = useAuth()
  const rejeu = user?.onboarding_termine ?? false

  return (
    <div className="space-y-3 text-sm text-texte">
      <p>{rejeu ? 'Configuration à jour.' : "C'est prêt. L'application est configurée et prête à accueillir tes données."}</p>
      <p className="text-texte-attenue">Cet assistant reste accessible à tout moment depuis Réglages → Général.</p>
    </div>
  )
}
