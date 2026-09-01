import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { Detenteur, TypeDetenteur } from '../api/types'
import Card from './Card'
import EtatErreur from './EtatErreur'
import EtatVide from './EtatVide'
import { SkeletonTexte } from './Skeleton'

/** Personnes et sociétés du foyer (backlog 2.L.1) : déclarées une fois ici,
 * réutilisées ensuite pour répartir la propriété des actifs (quotités, sur la
 * fiche détaillée de chaque position) et filtrer le patrimoine par détenteur
 * (barre de contrôles). */
export default function DetenteursCard() {
  const [detenteurs, setDetenteurs] = useState<Detenteur[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [nom, setNom] = useState('')
  const [type, setType] = useState<TypeDetenteur>('personne')
  const [saving, setSaving] = useState(false)

  function load() {
    setLoading(true)
    api
      .listDetenteurs()
      .then(setDetenteurs)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!nom.trim()) return
    setSaving(true)
    setError(null)
    try {
      await api.createDetenteur(nom.trim(), type)
      setNom('')
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
      await api.deleteDetenteur(id)
      load()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <Card title="Personnes et sociétés">
      <p className="mb-4 text-sm text-texte">
        Déclarées une fois, réutilisées pour répartir la propriété des actifs et des emprunts (quotités, depuis la fiche
        détaillée de chaque position) et filtrer le patrimoine par détenteur (barre de contrôles, en haut de l'écran).
      </p>

      {loading ? (
        <SkeletonTexte />
      ) : detenteurs.length === 0 ? (
        <EtatVide titre="Aucun détenteur déclaré." />
      ) : (
        <ul className="mb-4 divide-y divide-bordure">
          {detenteurs.map((d) => (
            <li key={d.id} className="flex items-center justify-between py-2 text-sm">
              <span className="text-texte">
                {d.nom} <span className="text-xs text-texte-attenue">({d.type === 'personne' ? 'Personne' : 'Société'})</span>
              </span>
              <button onClick={() => handleDelete(d.id)} className="text-xs text-negatif hover:underline">
                Supprimer
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={handleAdd} className="flex flex-wrap items-end gap-3 border-t border-bordure pt-4">
        <label className="flex flex-col gap-1 text-xs font-medium text-texte-attenue">
          Nom
          <input
            value={nom}
            onChange={(e) => setNom(e.target.value)}
            placeholder="Alice"
            className="w-40 rounded-md border border-bordure bg-surface px-2 py-1.5 text-sm text-texte"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-texte-attenue">
          Type
          <select
            value={type}
            onChange={(e) => setType(e.target.value as TypeDetenteur)}
            className="rounded-md border border-bordure bg-surface px-2 py-1.5 text-sm text-texte"
          >
            <option value="personne">Personne</option>
            <option value="societe">Société</option>
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
      {error && <EtatErreur message={error} onReessayer={load} />}
    </Card>
  )
}
