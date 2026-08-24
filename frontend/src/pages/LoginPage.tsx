import { useEffect, useState } from 'react'
import { api } from '../api/client'
import { useAuth } from '../hooks/useAuth'
import Card from '../components/Card'

type Mode = 'connexion' | 'creation'

// Message d'erreur renvoyé par le backend après un échec de connexion Authentik
// (backlog SSO Authentik) — porté en query param sur la redirection finale du
// callback OIDC, puisque cette page n'a jamais vu la requête XHR qui a échoué.
function erreurOidcDepuisUrl(): string | null {
  return new URLSearchParams(window.location.search).get('oidc_error')
}

export default function LoginPage() {
  const { login, register } = useAuth()
  const [mode, setMode] = useState<Mode>('connexion')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(() => erreurOidcDepuisUrl())
  const [oidcEnabled, setOidcEnabled] = useState(false)

  useEffect(() => {
    if (erreurOidcDepuisUrl()) {
      const params = new URLSearchParams(window.location.search)
      params.delete('oidc_error')
      const reste = params.toString()
      window.history.replaceState(null, '', window.location.pathname + (reste ? `?${reste}` : ''))
    }
    // Échec silencieux volontaire (backlog 2.K.5) : ce n'est pas une carte de
    // données qui disparaît, juste une fonctionnalité optionnelle absente sur les
    // déploiements où Authentik n'est pas configuré — le bouton reste alors caché.
    api
      .getOidcStatus()
      .then((s) => setOidcEnabled(s.enabled))
      .catch(() => {})
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      if (mode === 'connexion') await login(username, password)
      else await register(username, password)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-elevee px-6">
      <div className="w-full max-w-sm">
        <h1 className="mb-6 text-center text-xl font-semibold text-texte">Application Patrimoine</h1>
        <Card>
          <div className="mb-4 flex gap-1">
            <button
              type="button"
              onClick={() => setMode('connexion')}
              className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                mode === 'connexion'
                  ? 'bg-texte text-surface'
                  : 'bg-surface-elevee text-texte-attenue hover:text-texte'
              }`}
            >
              Se connecter
            </button>
            <button
              type="button"
              onClick={() => setMode('creation')}
              className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                mode === 'creation'
                  ? 'bg-texte text-surface'
                  : 'bg-surface-elevee text-texte-attenue hover:text-texte'
              }`}
            >
              Créer un compte
            </button>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-xs font-medium text-texte-attenue">
              Nom d'utilisateur
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoComplete="username"
                className="rounded-md border border-bordure bg-surface px-3 py-2 text-sm text-texte"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-texte-attenue">
              Mot de passe
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={mode === 'creation' ? 8 : undefined}
                autoComplete={mode === 'connexion' ? 'current-password' : 'new-password'}
                className="rounded-md border border-bordure bg-surface px-3 py-2 text-sm text-texte"
              />
              {mode === 'creation' && <span className="font-normal normal-case text-texte-attenue">8 caractères minimum</span>}
            </label>

            {error && <p className="text-sm text-negatif">{error}</p>}

            <button
              type="submit"
              disabled={saving}
              className="mt-1 rounded-md bg-accent px-4 py-2 text-sm font-medium text-surface disabled:opacity-40"
            >
              {saving ? 'Un instant...' : mode === 'connexion' ? 'Se connecter' : 'Créer mon compte'}
            </button>
          </form>

          {oidcEnabled && (
            <>
              <div className="my-4 flex items-center gap-3 text-xs text-texte-attenue">
                <span className="h-px flex-1 bg-bordure" />
                ou
                <span className="h-px flex-1 bg-bordure" />
              </div>
              <a
                href="/api/auth/oidc/login"
                className="block rounded-md border border-bordure px-4 py-2 text-center text-sm font-medium text-texte hover:bg-surface-elevee"
              >
                Se connecter avec Authentik
              </a>
            </>
          )}
        </Card>
      </div>
    </div>
  )
}
