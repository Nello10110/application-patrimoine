import { useEffect, useRef, useState } from 'react'
import { api } from '../api/client'
import type { EtatRafraichissement } from '../api/types'

const INTERVALLE_SONDAGE_MS = 2000

/** Encapsule le déclenchement d'un rafraîchissement des cours en tâche de fond
 * (LOT 4B) et le sondage de sa progression toutes les 2 secondes tant qu'il est en
 * cours. Partagé par le bouton "Rafraîchir les cours" du Portefeuille et "Lancer
 * maintenant" des Réglages : les deux déclenchent le même exécuteur côté API
 * (`GET /market-data/refresh/status`, cf. `scheduler_service.run_job_now`), donc la
 * même logique de sondage s'applique aux deux écrans.
 *
 * `onTermine` est appelé une fois le rafraîchissement terminé (succès ou échec),
 * pour laisser chaque écran recharger ce qui lui est propre (liste des positions,
 * config des jobs...).
 *
 * L'intervalle de sondage est nettoyé au démontage (retour de l'effet) — piège
 * classique sinon : sans ce nettoyage, un `setInterval` continuerait d'appeler
 * `setState` sur un composant démonté après un changement de page. */
export function useRafraichissementCours(onTermine?: (etat: EtatRafraichissement) => void) {
  const [etat, setEtat] = useState<EtatRafraichissement | null>(null)
  const [declenchementEnCours, setDeclenchementEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  // Toujours la dernière callback sans en faire une dépendance de l'effet de
  // sondage (qui ne doit se relancer que si `etat?.en_cours` change).
  const onTermineRef = useRef(onTermine)
  onTermineRef.current = onTermine

  useEffect(() => {
    if (!etat?.en_cours) return

    const intervalle = window.setInterval(async () => {
      try {
        const suivant = await api.getRefreshStatus()
        setEtat(suivant)
        if (!suivant.en_cours) {
          onTermineRef.current?.(suivant)
        }
      } catch (err) {
        setErreur((err as Error).message)
      }
    }, INTERVALLE_SONDAGE_MS)

    return () => window.clearInterval(intervalle)
  }, [etat?.en_cours])

  async function declencher(action: () => Promise<unknown>) {
    setErreur(null)
    setDeclenchementEnCours(true)
    try {
      await action()
      // La réponse du POST déclencheur varie selon l'écran (état de démarrage pour
      // `refreshMarketData`, config du job pour `runJobNow`) : on resonde tout de
      // suite le statut partagé plutôt que de dupliquer sa forme ici.
      const etatInitial = await api.getRefreshStatus()
      setEtat(etatInitial)
      // Un portefeuille de quelques lignes peut être rafraîchi avant même ce premier
      // sondage : l'effet de sondage ne démarrerait alors jamais (`en_cours` déjà
      // faux) et l'écran ne se rechargerait pas. On notifie donc la fin ici aussi.
      if (!etatInitial.en_cours) {
        onTermineRef.current?.(etatInitial)
      }
    } catch (err) {
      setErreur((err as Error).message)
    } finally {
      setDeclenchementEnCours(false)
    }
  }

  return {
    etat,
    enCours: declenchementEnCours || (etat?.en_cours ?? false),
    erreur,
    declencher,
  }
}
