import type { ReactNode } from 'react'
import EtapeBienvenue from './EtapeBienvenue'
import EtapeDemarragePortefeuille from './EtapeDemarragePortefeuille'
import EtapeDetenteurs from './EtapeDetenteurs'
import EtapePreferences from './EtapePreferences'
import EtapeTermine from './EtapeTermine'

export interface EtapeAssistant {
  key: string
  titre: string
  /** Composant (pas un simple `ReactNode` figé) : permet à une étape de lire l'état
   * déjà enregistré (préférences, détenteurs, portefeuille...) via ses propres hooks —
   * cf. commentaire de tête ci-dessous, condition pour que le rejeu depuis Réglages
   * reflète vraiment ce qui a déjà été saisi plutôt que de rejouer un parcours figé. */
  Contenu: () => ReactNode
}

/**
 * Étapes de l'assistant de configuration initiale (« welcome board »), dans l'ordre
 * d'affichage — cf. `WelcomeWizard.tsx`, qui se contente de les enchaîner.
 *
 * CE TABLEAU EST LE POINT D'EXTENSION À TENIR À JOUR : toute nouvelle fonctionnalité
 * de configuration (nouveau réglage général, nouvel onglet dans Réglages...) mérite
 * d'être envisagée ici, pour que le parcours guidé de démarrage reste représentatif
 * de ce que propose l'application — ne pas l'oublier lors de l'ajout d'une
 * fonctionnalité de ce type (demande explicite de l'utilisateur, 2026-09-01).
 *
 * Chaque étape est un composant (`Contenu`, un fichier dédié sous ce même dossier),
 * pas du JSX figé : l'assistant est rejouable à tout moment depuis Réglages ("Revoir
 * l'assistant de bienvenue"), y compris quand il a déjà été terminé une première fois
 * — chaque étape doit donc refléter l'état RÉELLEMENT enregistré (préférences,
 * détenteurs, nombre de positions déjà en portefeuille...), jamais se comporter comme
 * si l'instance était neuve (demande explicite, 2026-09-01). Les étapes qui reprennent
 * un réglage déjà éditable ailleurs réutilisent le composant existant tel quel
 * (`PreferencesCard`, `DetenteursCard` — tous deux déjà autonomes, avec leur propre
 * chargement/sauvegarde), garantie la plus simple qu'affichage et rejeu restent
 * cohérents.
 */
export const ETAPES_ONBOARDING: EtapeAssistant[] = [
  { key: 'bienvenue', titre: 'Bienvenue', Contenu: EtapeBienvenue },
  { key: 'preferences', titre: 'Préférences', Contenu: EtapePreferences },
  { key: 'detenteurs', titre: 'Détenteurs du foyer', Contenu: EtapeDetenteurs },
  { key: 'demarrage', titre: 'Démarrer le portefeuille', Contenu: EtapeDemarragePortefeuille },
  { key: 'termine', titre: 'Terminé', Contenu: EtapeTermine },
]
