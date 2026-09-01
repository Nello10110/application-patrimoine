import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { Detenteur, HouseholdMember, Role } from '../api/types'
import Card from './Card'
import EtatErreur from './EtatErreur'
import EtatVide from './EtatVide'
import { SkeletonTexte } from './Skeleton'

const ROLE_LABELS: Record<Role, string> = { proprietaire: 'Propriétaire', membre: 'Membre du foyer', invite: 'Invité' }

/** Comptes du foyer (backlog 2.L.2) : le propriétaire crée les comptes membre/invité
 * — l'auto-inscription se ferme après le tout premier compte (`routers/auth.py`).
 * Un invité doit se voir assigner au moins un détenteur pour voir quoi que ce soit
 * (périmètre vide par défaut, jamais "tout le foyer" implicitement). */
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
          {membres.map((m) => (
            <li key={m.id} className="flex items-center justify-between py-2 text-sm">
              <span className="text-texte">
                {m.nom || m.username} <span className="text-xs text-texte-attenue">({ROLE_LABELS[m.role]})</span>
                {m.email && <span className="ml-1 text-xs text-texte-attenue">· {m.email}</span>}
              </span>
              <button onClick={() => handleDelete(m.id)} className="text-xs text-negatif hover:underline">
                Supprimer
              </button>
            </li>
          ))}
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
