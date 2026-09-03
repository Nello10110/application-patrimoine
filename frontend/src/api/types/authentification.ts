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
}

export interface AuthResponse {
  token: string
  user: AuthUser
}

// Connexion SSO (OIDC applicatif) — `enabled` reflète si la configuration
// (Réglages → Connexion SSO, propriétaire) est complète, activée, sur ce déploiement.
// `display_name` : texte choisi par le propriétaire pour le bouton de connexion
// (jamais un nom de fournisseur figé dans le code).
export interface OidcStatus {
  enabled: boolean
  display_name: string
}

// Administration de la configuration (propriétaire) — `client_secret` n'apparaît
// jamais dans une réponse, seulement `secret_configure` (une valeur est enregistrée
// ou non). `cle_chiffrement_definie` reflète `PATRIMOINE_SECRET_KEY` côté serveur :
// sans elle, aucun secret ne peut être chiffré, donc enregistré. `claim_*` : nom du
// claim OIDC mappé vers chaque attribut utilisateur (valeurs par défaut standard si
// jamais personnalisées).
export interface OidcConfig {
  issuer: string | null
  client_id: string | null
  redirect_uri: string | null
  frontend_url: string | null
  secret_configure: boolean
  cle_chiffrement_definie: boolean
  enabled: boolean
  display_name: string
  claim_username: string
  claim_email: string
  claim_nom: string
}

export interface OidcConfigInput {
  issuer: string
  client_id: string
  redirect_uri: string
  frontend_url: string
  // Omis ou vide : le secret déjà enregistré est conservé tel quel.
  client_secret?: string
  enabled?: boolean
  display_name?: string
  claim_username?: string
  claim_email?: string
  claim_nom?: string
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
}
