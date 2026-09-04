// Multi-utilisateur (Milestone 1) — `AuthResponse` est la réponse commune de
// `/auth/register` et `/auth/login`.
export type Role = 'proprietaire' | 'membre' | 'invite'

export interface AuthUser {
  id: number
  username: string
  role: Role
  // Métadonnées d'affichage pures (backlog SSO, claim mapping) — `null` pour un
  // compte mot de passe local, jamais utilisées pour l'authentification.
  email?: string | null
  nom?: string | null
  // Assistant de configuration initiale (welcome board) — `false` pour tout compte
  // neuf, quel que soit son mode de création (inscription locale ou premier compte
  // provisionné par SSO). Posé explicitement par le backend sur chaque réponse
  // contenant un utilisateur (`register`/`login`/`me`/`onboarding/terminer`).
  onboarding_termine: boolean
  // Écran de rattrapage bloquant (revue du 03/09/2026, compte obligatoire sur une
  // ligne financière) : tant que > 0, `App.tsx` affiche `RattrapageComptes` plutôt
  // que l'application (sauf pour un `invite`, lecture seule).
  holdings_sans_compte: number
}

export interface AuthResponse {
  token: string
  user: AuthUser
}

// Connexion SSO (OIDC applicatif) — `enabled` reflète si la configuration, portée
// par les variables d'environnement `PATRIMOINE_OIDC_*` du serveur (pas de réglage
// modifiable depuis l'IHM), est complète et activée sur ce déploiement.
// `display_name` : texte choisi par variable d'environnement pour le bouton de
// connexion (jamais un nom de fournisseur figé dans le code).
export interface OidcStatus {
  enabled: boolean
  display_name: string
}

// Sessions et journal d'accès (backlog 2.L.2).
export interface Session {
  id_session: string
  created_at: string
  expires_at: string
  derniere_utilisation: string
  ip: string | null
  user_agent: string | null
  est_courante: boolean
}

export interface AccessLogEntry {
  id: number
  timestamp: string
  username_saisi: string
  ip: string | null
  action: 'login' | 'logout'
  resultat: 'succes' | 'echec'
  raison: string | null
}

// Comptes du foyer — membre/invité (backlog 2.L.2), créés exclusivement par le
// propriétaire depuis Réglages (l'auto-inscription se ferme après le tout premier
// compte, cf. `routers/auth.py`).
export interface HouseholdMemberInput {
  username: string
  password: string
  role: 'membre' | 'invite'
  detenteur_ids?: number[]
}

export interface HouseholdMember {
  id: number
  username: string
  role: Role
  created_at: string
  detenteur_ids: number[]
  email?: string | null
  nom?: string | null
  // Écran d'administration des comptes (revue du 04/09/2026) : `null` = compte mot
  // de passe local, une chaîne = provisionné/lié via ce fournisseur SSO (son
  // `display_name` — pas juste un booléen, pour afficher directement lequel).
  oidc_display_name?: string | null
  derniere_connexion?: string | null
  sessions_actives?: number
  verrouille_jusqua?: string | null
}
