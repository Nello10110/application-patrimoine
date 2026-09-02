import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { Etablissement } from '../api/types'
import Card from './Card'
import EtatErreur from './EtatErreur'
import EtatVide from './EtatVide'
import { SkeletonTexte } from './Skeleton'

/** Établissements financiers (écran Comptes, backlog X.1) : déclarés une fois
 * ici, réutilisés ensuite pour regrouper les comptes à l'écran (ex. « Caisse
 * d'Épargne » contenant un compte courant ET une assurance-vie) — même patron que
 * `DetenteursCard.tsx`. */
export default function EtablissementsCard() {
  const [etablissements, setEtablissements] = useState<Etablissement[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [nom, setNom] = useState('')
  const [saving, setSaving] = useState(false)

  function load() {
    setLoading(true)
    api
      .listEtablissements()
      .then(setEtablissements)
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
      await api.createEtablissement(nom.trim())
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
      await api.deleteEtablissement(id)
      load()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <Card title="Établissements">
      <p className="mb-4 text-sm text-texte">
        Banques et courtiers, déclarés une fois, réutilisés pour regrouper tes comptes à l'écran{' '}
        <span className="font-medium text-texte">Comptes</span> (ex. « Caisse d'Épargne » contenant un compte courant et une
        assurance-vie). Supprimer un établissement ne touche jamais les comptes qui lui étaient rattachés — ils retombent
        simplement dans « Sans établissement ».
      </p>

      {loading ? (
        <SkeletonTexte />
      ) : etablissements.length === 0 ? (
        <EtatVide titre="Aucun établissement déclaré." />
      ) : (
        <ul className="mb-4 divide-y divide-bordure">
          {etablissements.map((e) => (
            <li key={e.id} className="flex items-center justify-between py-2 text-sm">
              <span className="text-texte">{e.nom}</span>
              <button onClick={() => handleDelete(e.id)} className="text-xs text-negatif hover:underline">
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
            placeholder="Caisse d'Épargne"
            className="w-48 rounded-md border border-bordure bg-surface px-2 py-1.5 text-sm text-texte"
          />
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
