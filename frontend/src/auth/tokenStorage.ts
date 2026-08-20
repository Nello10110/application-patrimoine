// Jeton de session (multi-utilisateur, Milestone 1) : persisté en `localStorage`
// (pas de cookie, cf. `backend/app/main.py` — jamais de `allow_credentials`),
// couplé à `api/client.ts` via un callback plutôt qu'un import direct de React
// Router, pour garder ce module bas niveau indépendant de React.

const TOKEN_KEY = 'patrimoine_auth_token'

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY)
}

type UnauthorizedHandler = () => void

let onUnauthorized: UnauthorizedHandler | null = null

export function setUnauthorizedHandler(handler: UnauthorizedHandler | null): void {
  onUnauthorized = handler
}

export function notifyUnauthorized(): void {
  onUnauthorized?.()
}
