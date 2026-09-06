import { useEffect, useState } from 'react'
import { api } from '../api/client'
import { useAuth } from '../hooks/useAuth'
import { PrimaryButton } from '../components/Controls'
import { GlassPanel } from '../components/GlassPanel'

type Mode = 'connexion' | 'creation'

// Message d'erreur renvoyé par le backend après un échec de connexion SSO (backlog
// SSO) — porté en query param sur la redirection finale du callback OIDC, puisque
// cette page n'a jamais vu la requête XHR qui a échoué.
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
  const [oidcDisplayName, setOidcDisplayName] = useState('SSO')

  useEffect(() => {
    if (erreurOidcDepuisUrl()) {
      const params = new URLSearchParams(window.location.search)
      params.delete('oidc_error')
      const reste = params.toString()
      window.history.replaceState(null, '', window.location.pathname + (reste ? `?${reste}` : ''))
    }
    // Échec silencieux volontaire (backlog 2.K.5) : ce n'est pas une carte de
    // données qui disparaît, juste une fonctionnalité optionnelle absente sur les
    // déploiements où le SSO n'est pas configuré (ou désactivé) — le bouton reste
    // alors caché.
    api
      .getOidcStatus()
      .then((s) => {
        setOidcEnabled(s.enabled)
        setOidcDisplayName(s.display_name)
      })
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
    // Pas de fond opaque ici : l'écran de connexion est le premier endroit où le
    // fond à halos de la refonte est visible, le panneau de verre flottant dessus.
    <div className="flex min-h-screen items-center justify-center px-6">
      <GlassPanel niveau="hero" className="w-full max-w-[400px] rounded-[26px] px-7 py-[30px]">
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="flex h-11 w-11 items-center justify-center rounded-control bg-[image:var(--accent-grad)] text-lg font-bold text-white shadow-accent"
          >
            P
          </span>
          <div>
            <h1 className="text-[26px] font-semibold tracking-title text-ink">
              {mode === 'connexion' ? 'Bon retour' : 'Créer un compte'}
            </h1>
            <p className="text-sm text-ink3">Application Patrimoine</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink3">
            Nom d'utilisateur
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoComplete="username"
              className="rounded-[12px] border border-hairline bg-chip px-3 py-2.5 text-sm font-normal normal-case text-ink"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink3">
            Mot de passe
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={mode === 'creation' ? 8 : undefined}
              autoComplete={mode === 'connexion' ? 'current-password' : 'new-password'}
              className="rounded-[12px] border border-hairline bg-chip px-3 py-2.5 text-sm font-normal normal-case text-ink"
            />
            {mode === 'creation' && (
              <span className="font-normal normal-case tracking-normal text-ink4">8 caractères minimum</span>
            )}
          </label>

          {error && <p className="text-sm text-neg">{error}</p>}

          <PrimaryButton type="submit" disabled={saving} className="w-full">
            {saving ? 'Un instant...' : mode === 'connexion' ? 'Se connecter' : 'Créer mon compte'}
          </PrimaryButton>
        </form>

        {oidcEnabled && (
          <>
            <div className="my-4 flex items-center gap-3 text-xs text-ink4">
              <span className="h-px flex-1 bg-hairline" />
              ou
              <span className="h-px flex-1 bg-hairline" />
            </div>
            <a
              href="/api/auth/oidc/login"
              className="block rounded-control border border-hairline bg-chip px-4 py-2 text-center text-sm font-medium text-ink2 hover:bg-hover"
            >
              Se connecter avec {oidcDisplayName}
            </a>
          </>
        )}

        {/* Les deux onglets « Se connecter / Créer un compte » deviennent un simple
            lien (maquette de la refonte) : ils donnaient le même poids visuel aux deux
            actions, alors qu'on se connecte cent fois pour un compte créé une fois. La
            création reste accessible, sans hiérarchiser à tort. */}
        <p className="mt-5 text-center text-[13px] text-ink3">
          {mode === 'connexion' ? (
            <>
              Pas encore de compte ?{' '}
              <button type="button" onClick={() => setMode('creation')} className="font-medium text-accent hover:underline">
                Créer un compte
              </button>
            </>
          ) : (
            <>
              Déjà un compte ?{' '}
              <button type="button" onClick={() => setMode('connexion')} className="font-medium text-accent hover:underline">
                Se connecter
              </button>
            </>
          )}
        </p>
      </GlassPanel>
    </div>
  )
}
