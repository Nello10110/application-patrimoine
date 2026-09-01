import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { OidcConfig } from '../api/types'
import Card from './Card'
import EtatErreur from './EtatErreur'
import { SkeletonTexte } from './Skeleton'

/** Connexion SSO / OIDC (backlog 2.L.3) : configuration administrable ici plutôt
 * qu'en variables d'environnement — champs texte en clair, le `client_secret` est
 * saisissable mais jamais relu (chiffré au repos côté serveur, `secret_configure`
 * indique seulement s'il y en a un). Volontairement générique (pas « Authentik ») :
 * le fournisseur OIDC utilisé (Authentik ou autre) est un choix de déploiement, pas
 * un nom figé dans le produit — `display_name` (texte libre) est ce qui apparaît sur
 * le bouton de connexion. Réservée au propriétaire comme les autres cartes
 * d'administration de cette page (pas de gating de rôle côté frontend : un
 * non-propriétaire obtient un 403, affiché ci-dessous comme n'importe quelle autre
 * erreur de chargement). */
export default function SsoCard() {
  const [config, setConfig] = useState<OidcConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const [enabled, setEnabled] = useState(true)
  const [displayName, setDisplayName] = useState('')
  const [issuer, setIssuer] = useState('')
  const [clientId, setClientId] = useState('')
  const [redirectUri, setRedirectUri] = useState('')
  const [frontendUrl, setFrontendUrl] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [claimUsername, setClaimUsername] = useState('')
  const [claimEmail, setClaimEmail] = useState('')
  const [claimNom, setClaimNom] = useState('')

  function charger() {
    setLoading(true)
    setError(null)
    api
      .getOidcConfig()
      .then((c) => {
        setConfig(c)
        setEnabled(c.enabled)
        setDisplayName(c.display_name)
        setIssuer(c.issuer ?? '')
        setClientId(c.client_id ?? '')
        setRedirectUri(c.redirect_uri ?? '')
        setFrontendUrl(c.frontend_url ?? '')
        setClaimUsername(c.claim_username)
        setClaimEmail(c.claim_email)
        setClaimNom(c.claim_nom)
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(charger, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setMessage(null)
    try {
      const nouvelleConfig = await api.updateOidcConfig({
        issuer,
        client_id: clientId,
        redirect_uri: redirectUri,
        frontend_url: frontendUrl,
        enabled,
        display_name: displayName,
        claim_username: claimUsername,
        claim_email: claimEmail,
        claim_nom: claimNom,
        ...(clientSecret ? { client_secret: clientSecret } : {}),
      })
      setConfig(nouvelleConfig)
      setClientSecret('')
      setMessage('Configuration enregistrée.')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <Card title="Connexion SSO (OIDC)"><SkeletonTexte /></Card>
  if (error && !config) return <Card title="Connexion SSO (OIDC)"><EtatErreur message={error} onReessayer={charger} /></Card>

  return (
    <Card title="Connexion SSO (OIDC)">
      <p className="mb-4 text-sm text-texte">
        Bouton de connexion sur l'écran de connexion, en plus du mot de passe — vrai flux OIDC (Authorization Code +
        PKCE), qui ne fait confiance à aucun en-tête de proxy. Compatible avec n'importe quel fournisseur OIDC
        (Authentik, Keycloak, Zitadel...).
      </p>
      {config && !config.cle_chiffrement_definie && (
        <p className="mb-4 rounded-md border border-avertissement/40 bg-avertissement/10 p-3 text-sm text-avertissement">
          <code className="font-mono">PATRIMOINE_SECRET_KEY</code> n'est pas définie sur le serveur : impossible
          d'enregistrer un secret tant que cette variable d'environnement n'est pas posée (voir le manuel
          d'exploitation).
        </p>
      )}
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <label className="flex items-center gap-2 text-sm text-texte">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          Activée
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-texte-attenue">
          Nom affiché sur le bouton de connexion
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="SSO"
            className="rounded-md border border-bordure bg-surface px-3 py-2 text-sm text-texte"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-texte-attenue">
          Issuer (URL de l'application OIDC de ton fournisseur SSO)
          <input
            value={issuer}
            onChange={(e) => setIssuer(e.target.value)}
            placeholder="https://sso.example.com/application/o/patrimoine"
            required
            className="rounded-md border border-bordure bg-surface px-3 py-2 text-sm text-texte"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-texte-attenue">
          Client ID
          <input
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            required
            className="rounded-md border border-bordure bg-surface px-3 py-2 text-sm text-texte"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-texte-attenue">
          Client Secret
          <input
            type="password"
            value={clientSecret}
            onChange={(e) => setClientSecret(e.target.value)}
            placeholder={config?.secret_configure ? 'Laisser vide pour conserver le secret actuel' : 'Non configuré'}
            autoComplete="off"
            className="rounded-md border border-bordure bg-surface px-3 py-2 text-sm text-texte"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-texte-attenue">
          Redirect URI (doit correspondre exactement à celle enregistrée côté fournisseur SSO)
          <input
            value={redirectUri}
            onChange={(e) => setRedirectUri(e.target.value)}
            placeholder="https://patrimoine.example.com/api/auth/oidc/callback"
            required
            className="rounded-md border border-bordure bg-surface px-3 py-2 text-sm text-texte"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-texte-attenue">
          URL publique du frontend (retour du navigateur après connexion)
          <input
            value={frontendUrl}
            onChange={(e) => setFrontendUrl(e.target.value)}
            placeholder="https://patrimoine.example.com"
            required
            className="rounded-md border border-bordure bg-surface px-3 py-2 text-sm text-texte"
          />
        </label>

        <div className="mt-2 border-t border-bordure pt-3">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-texte-attenue">
            Mapping des claims (facultatif — laisser vide pour les valeurs par défaut)
          </p>
          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-xs font-medium text-texte-attenue">
              Claim → nom d'utilisateur
              <input
                value={claimUsername}
                onChange={(e) => setClaimUsername(e.target.value)}
                placeholder="preferred_username"
                className="rounded-md border border-bordure bg-surface px-3 py-2 text-sm text-texte"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-texte-attenue">
              Claim → email
              <input
                value={claimEmail}
                onChange={(e) => setClaimEmail(e.target.value)}
                placeholder="email"
                className="rounded-md border border-bordure bg-surface px-3 py-2 text-sm text-texte"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-texte-attenue">
              Claim → nom affiché
              <input
                value={claimNom}
                onChange={(e) => setClaimNom(e.target.value)}
                placeholder="name"
                className="rounded-md border border-bordure bg-surface px-3 py-2 text-sm text-texte"
              />
            </label>
          </div>
        </div>

        {message && <p className="text-sm text-positif">{message}</p>}
        {error && <EtatErreur message={error} />}
        <button
          type="submit"
          disabled={saving}
          className="mt-1 self-start rounded-md bg-accent px-4 py-2 text-sm font-medium text-surface disabled:opacity-40"
        >
          {saving ? 'Enregistrement...' : 'Enregistrer'}
        </button>
      </form>
    </Card>
  )
}
