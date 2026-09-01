import { useState } from 'react'
import { api } from '../api/client'
import type { CategorieBudget, RegleCategorisation } from '../api/types'

export default function CategoriesEtReglesSection({
  categories,
  regles,
  onChanged,
}: {
  categories: CategorieBudget[]
  regles: RegleCategorisation[]
  onChanged: () => void
}) {
  const [nouvelleCategorie, setNouvelleCategorie] = useState('')
  const [motif, setMotif] = useState('')
  const [categorieRegle, setCategorieRegle] = useState<number | ''>('')
  const [reapplicationEnCours, setReapplicationEnCours] = useState(false)
  const [messageReapplication, setMessageReapplication] = useState<string | null>(null)

  const categoriesRacines = categories.filter((c) => c.parent_id === null)

  async function ajouterCategorie() {
    if (!nouvelleCategorie.trim()) return
    await api.createCategorieBudget(nouvelleCategorie.trim())
    setNouvelleCategorie('')
    onChanged()
  }

  async function supprimerCategorie(id: number) {
    await api.deleteCategorieBudget(id)
    onChanged()
  }

  async function ajouterRegle() {
    if (!motif.trim() || categorieRegle === '') return
    await api.createRegleCategorisation(motif.trim(), categorieRegle)
    setMotif('')
    setCategorieRegle('')
    onChanged()
  }

  async function supprimerRegle(id: number) {
    await api.deleteRegleCategorisation(id)
    onChanged()
  }

  async function reappliquer() {
    setReapplicationEnCours(true)
    setMessageReapplication(null)
    try {
      const res = await api.reappliquerReglesCategorisation()
      setMessageReapplication(`${res.mouvements_modifies} mouvement(s) recatégorisé(s).`)
      onChanged()
    } finally {
      setReapplicationEnCours(false)
    }
  }

  return (
    <details open className="rounded-lg border border-bordure bg-surface">
      <summary className="cursor-pointer px-4 py-3 text-sm font-semibold uppercase tracking-wide text-texte-attenue">
        Catégories et règles de catégorisation
      </summary>
      <div className="space-y-6 border-t border-bordure p-4">
        <div>
          <h4 className="mb-2 text-sm font-medium text-texte">Catégories</h4>
          <ul className="mb-3 flex flex-wrap gap-2">
            {categoriesRacines.map((c) => (
              <li key={c.id} className="flex items-center gap-1.5 rounded-full bg-surface-elevee px-3 py-1 text-sm text-texte">
                {c.nom}
                <button onClick={() => supprimerCategorie(c.id)} aria-label={`Supprimer ${c.nom}`} className="text-texte-attenue hover:text-negatif">
                  ×
                </button>
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <input
              value={nouvelleCategorie}
              onChange={(e) => setNouvelleCategorie(e.target.value)}
              placeholder="Nouvelle catégorie"
              className="rounded-md border border-bordure bg-surface px-2 py-1.5 text-sm text-texte"
            />
            <button onClick={ajouterCategorie} className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-surface">
              Ajouter
            </button>
          </div>
        </div>

        <div>
          <h4 className="mb-2 text-sm font-medium text-texte">
            Règles de catégorisation automatique
            <span className="ml-1 font-normal normal-case text-texte-attenue">— « le libellé contient le motif → catégorie »</span>
          </h4>
          {regles.length > 0 && (
            <ul className="mb-3 space-y-1">
              {regles.map((r) => {
                const cat = categories.find((c) => c.id === r.categorie_id)
                return (
                  <li key={r.id} className="flex items-center justify-between gap-2 text-sm text-texte">
                    <span>
                      « {r.motif} » → {cat?.nom ?? '?'}
                    </span>
                    <button onClick={() => supprimerRegle(r.id)} className="text-xs text-texte-attenue hover:text-negatif">
                      Supprimer
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
          <div className="flex flex-wrap gap-2">
            <input
              value={motif}
              onChange={(e) => setMotif(e.target.value)}
              placeholder="Motif (ex. sncf)"
              className="rounded-md border border-bordure bg-surface px-2 py-1.5 text-sm text-texte"
            />
            <select
              value={categorieRegle}
              onChange={(e) => setCategorieRegle(e.target.value ? Number(e.target.value) : '')}
              className="rounded-md border border-bordure bg-surface px-2 py-1.5 text-sm text-texte"
            >
              <option value="">— Catégorie —</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.parent_id !== null ? '↳ ' : ''}
                  {c.nom}
                </option>
              ))}
            </select>
            <button onClick={ajouterRegle} className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-surface">
              Ajouter la règle
            </button>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <button
              onClick={reappliquer}
              disabled={reapplicationEnCours}
              className="rounded-md border border-bordure px-3 py-1.5 text-sm font-medium text-texte disabled:opacity-40"
            >
              {reapplicationEnCours ? 'Réapplication en cours...' : 'Réappliquer les règles en masse'}
            </button>
            {messageReapplication && <span className="text-sm text-texte-attenue">{messageReapplication}</span>}
          </div>
        </div>
      </div>
    </details>
  )
}
