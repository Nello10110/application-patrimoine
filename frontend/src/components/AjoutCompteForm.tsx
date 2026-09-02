import { useState } from 'react'
import { api } from '../api/client'
import type { Etablissement } from '../api/types'
import EtatErreur from './EtatErreur'

/** Formulaire d'ajout d'un compte (nom + établissement optionnel) — patron
 * `DetenteursCard.tsx`. Extrait de `ComptesPage.tsx` pour être réutilisé tel quel
 * dans l'assistant de bienvenue (`EtapeComptes.tsx`, backlog X.3). */
export default function AjoutCompteForm({ etablissements, onCreated }: { etablissements: Etablissement[]; onCreated: () => void }) {
  const [nom, setNom] = useState('')
  const [etablissementId, setEtablissementId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!nom.trim()) return
    setSaving(true)
    setError(null)
    try {
      await api.createCompte(nom.trim(), etablissementId ? Number(etablissementId) : null)
      setNom('')
      setEtablissementId('')
      onCreated()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleAdd} className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1 text-xs font-medium text-texte-attenue">
        Nom
        <input
          value={nom}
          onChange={(e) => setNom(e.target.value)}
          placeholder="PEA, Livret A..."
          className="w-40 rounded-md border border-bordure bg-surface px-2 py-1.5 text-sm text-texte"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-texte-attenue">
        Établissement
        <select
          value={etablissementId}
          onChange={(e) => setEtablissementId(e.target.value)}
          className="w-48 rounded-md border border-bordure bg-surface px-2 py-1.5 text-sm text-texte"
        >
          <option value="">— Sans établissement —</option>
          {etablissements.map((et) => (
            <option key={et.id} value={et.id}>
              {et.nom}
            </option>
          ))}
        </select>
      </label>
      <button
        type="submit"
        disabled={saving}
        className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-surface disabled:opacity-40"
      >
        + Nouveau compte
      </button>
      {error && <EtatErreur message={error} />}
    </form>
  )
}
