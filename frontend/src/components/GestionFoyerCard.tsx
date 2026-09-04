import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { Detenteur, HouseholdMember, Role } from '../api/types'
import Card from './Card'
import EtatErreur from './EtatErreur'
import EtatVide from './EtatVide'
import { SkeletonTexte } from './Skeleton'
import { formatDateHeure } from '../utils/format'

const ROLE_LABELS: Record<Role, string> = { proprietaire: 'Propriétaire', membre: 'Membre du foyer', invite: 'Invité' }

/** Comptes du foyer (backlog 2.L.2, écran d'administration étendu le 04/09/2026) :
 * le propriétaire crée les comptes membre/invité — l'auto-inscription se ferme après
 * le tout premier compte (`routers/auth.py`). Un invité doit se voir assigner au
 * moins un détenteur pour voir quoi que ce soit (périmètre vide par défaut, jamais
 * "tout le foyer" implicitement). Origine locale/SSO, dernière connexion, sessions
 * actives, verrouillage en cours et rôle éditable calculés côté serveur
 * (`_household_member_out`, `routers/auth.py`) — jamais recalculés ici. */
export default function GestionFoyerCard() {
  const [membres, setMembres] = useState<HouseholdMember[]>([])
  const [detenteurs, setDetenteurs] = useState<Detenteur[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<'membre' | 'invite'>('membre')
  const [detenteurIds, setDetenteurIds] = useState<number[]>([])
  const [saving, setSaving] = useState(false)
  const [changingRoleId, setChangingRoleId] = useState<number | null>(null)

  function load() {
    setLoading(true)
    Promise.all([api.listHouseholdMembers(), api.listDetenteurs()])
      .then(([m, d]) => {
        setMembres(m)
        setDetenteurs(d)
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!username.trim() || password.length < 8) return
    setSaving(true)
    setError(null)
    try {
      await api.createHouseholdMember({
        username: username.trim(),
        password,
        role,
        detenteur_ids: role === 'invite' ? detenteurIds : undefined,
      })
      setUsername('')
      setPassword('')
      setDetenteurIds([])
      load()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: number) {
    setError(null)
    try {
      await api.deleteHouseholdMember(id)
      load()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  async function handleRoleChange(id: number, nouveauRole: 'membre' | 'invite') {
    setError(null)
    setChangingRoleId(id)
    try {
      await api.updateHouseholdMemberRole(id, nouveauRole)
      load()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setChangingRoleId(null)
    }
  }

  function toggleDetenteur(id: number) {
    setDetenteurIds((prev) => (prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]))
  }

  return (
    <Card title="Comptes du foyer">
      <p className="mb-4 text-sm text-texte-attenue">
        Un membre peut consulter et saisir des actifs/emprunts/transactions du foyer, mais pas les objectifs ni la
        sécurité. Un invité ne voit, en lecture seule, que le patrimoine net et le portefeuille des détenteurs qui lui
        sont assignés ci-dessous.
      </p>

      {loading ? (
        <SkeletonTexte />
      ) : membres.length === 0 ? (
        <EtatVide titre="Aucun autre compte dans ce foyer." description="Ajoute un membre ou un invité avec le formulaire ci-dessous." />
      ) : (
        <ul className="mb-4 divide-y divide-bordure">
          {membres.map((m) => {
            const verrouille = m.verrouille_jusqua && new Date(m.verrouille_jusqua) > new Date()
            return (
              <li key={m.id} className="flex flex-col gap-1.5 py-2.5 text-sm sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-texte">
                    <span className="font-medium">{m.nom || m.username}</span>
                    {m.email && <span className="text-xs text-texte-attenue">· {m.email}</span>}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-texte-attenue">
                    <span title={m.oidc_display_name ? `Compte provisionné/lié via ${m.oidc_display_name}` : 'Compte mot de passe local'}>
                      {m.oidc_display_name ? `Connexion SSO (${m.oidc_display_name})` : 'Connexion locale'}
                    </span>
                    <span>·</span>
                    <span>
                      {m.derniere_connexion ? `Dernière connexion ${formatDateHeure(m.derniere_connexion)}` : 'Jamais connecté'}
                    </span>
                    {!!m.sessions_actives && (
                      <span>
                        · {m.sessions_actives} session{m.sessions_actives > 1 ? 's' : ''} active{m.sessions_actives > 1 ? 's' : ''}
                      </span>
                    )}
                    {verrouille && (
                      <span
                        className="rounded-full bg-negatif/10 px-1.5 py-0.5 font-medium text-negatif"
                        title="Trop de tentatives de connexion échouées récentes"
                      >
                        Verrouillé jusqu'à {formatDateHeure(m.verrouille_jusqua!)}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <label className="flex items-center gap-1.5 text-xs text-texte-attenue">
                    Rôle
                    <select
                      aria-label={`Rôle de ${m.username}`}
                      value={m.role}
                      disabled={changingRoleId === m.id}
                      onChange={(e) => handleRoleChange(m.id, e.target.value as 'membre' | 'invite')}
                      className="rounded-md border border-bordure bg-surface px-2 py-1 text-sm text-texte disabled:opacity-40"
                    >
                      <option value="membre">{ROLE_LABELS.membre}</option>
                      <option value="invite">{ROLE_LABELS.invite}</option>
                    </select>
                  </label>
                  <button
                    onClick={() => handleDelete(m.id)}
                    aria-label={`Supprimer le compte ${m.username}`}
                    className="text-xs text-negatif hover:underline"
                  >
                    Supprimer
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <form onSubmit={handleAdd} className="flex flex-wrap items-end gap-3 border-t border-bordure pt-4">
        <label className="flex flex-col gap-1 text-xs font-medium text-texte-attenue">
          Nom d'utilisateur
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-36 rounded-md border border-bordure bg-surface px-2 py-1.5 text-sm text-texte"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-texte-attenue">
          Mot de passe
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            className="w-36 rounded-md border border-bordure bg-surface px-2 py-1.5 text-sm text-texte"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-texte-attenue">
          Rôle
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as 'membre' | 'invite')}
            className="rounded-md border border-bordure bg-surface px-2 py-1.5 text-sm text-texte"
          >
            <option value="membre">Membre du foyer</option>
            <option value="invite">Invité</option>
          </select>
        </label>
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-surface disabled:opacity-40"
        >
          Ajouter
        </button>
      </form>

      {role === 'invite' && (
        <div className="mt-3 flex flex-wrap gap-2">
          {detenteurs.map((d) => (
            <label key={d.id} className="flex items-center gap-1.5 text-xs text-texte">
              <input type="checkbox" checked={detenteurIds.includes(d.id)} onChange={() => toggleDetenteur(d.id)} />
              {d.nom}
            </label>
          ))}
          {detenteurs.length === 0 && <span className="text-xs text-texte-attenue">Aucun détenteur déclaré.</span>}
        </div>
      )}

      {error && <EtatErreur message={error} onReessayer={load} />}
    </Card>
  )
}
