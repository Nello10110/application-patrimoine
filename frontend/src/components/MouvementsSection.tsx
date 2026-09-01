import { useState } from 'react'
import { api } from '../api/client'
import type { CategorieBudget, MouvementBancaire } from '../api/types'
import Card from './Card'
import EtatVide from './EtatVide'
import { usePreferencesAffichage } from '../hooks/usePreferencesAffichage'
import { formatDate, formatEuro } from '../utils/format'

/** Filtres catégorie/compte (backlog 2.N.2) — appliqués côté client sur la liste
 * déjà chargée pour la période : le volume d'un budget personnel reste modeste, et
 * ça évite un aller-retour réseau supplémentaire à chaque changement de filtre
 * (même logique que le filtrage par catégorie de `PortefeuillePage`). */
export default function MouvementsSection({
  mouvementsPeriode,
  categories,
  onCategorized,
}: {
  mouvementsPeriode: MouvementBancaire[]
  categories: CategorieBudget[]
  onCategorized: () => void
}) {
  const { montantsMasques } = usePreferencesAffichage()
  const [filtreCategorieId, setFiltreCategorieId] = useState<number | 'TOUTES' | 'NON_CATEGORISE'>('TOUTES')
  const [filtreCompte, setFiltreCompte] = useState('TOUS')

  const comptesDisponibles = Array.from(new Set(mouvementsPeriode.map((m) => m.compte).filter((c): c is string => Boolean(c)))).sort(
    (a, b) => a.localeCompare(b, 'fr'),
  )

  const mouvements = mouvementsPeriode.filter((m) => {
    if (filtreCategorieId === 'NON_CATEGORISE' && m.categorie_id !== null) return false
    if (typeof filtreCategorieId === 'number' && m.categorie_id !== filtreCategorieId) return false
    if (filtreCompte !== 'TOUS' && m.compte !== filtreCompte) return false
    return true
  })

  const filtres = (
    <div className="flex flex-wrap gap-2">
      <select
        value={filtreCategorieId}
        onChange={(e) => setFiltreCategorieId(e.target.value === 'TOUTES' || e.target.value === 'NON_CATEGORISE' ? e.target.value : Number(e.target.value))}
        className="rounded-md border border-bordure bg-surface px-2 py-1 text-xs text-texte"
      >
        <option value="TOUTES">Toutes catégories</option>
        <option value="NON_CATEGORISE">Non catégorisé</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.parent_id !== null ? '↳ ' : ''}
            {c.nom}
          </option>
        ))}
      </select>
      {comptesDisponibles.length > 0 && (
        <select
          value={filtreCompte}
          onChange={(e) => setFiltreCompte(e.target.value)}
          className="rounded-md border border-bordure bg-surface px-2 py-1 text-xs text-texte"
        >
          <option value="TOUS">Tous les comptes</option>
          {comptesDisponibles.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      )}
    </div>
  )

  if (mouvementsPeriode.length === 0) {
    return (
      <Card title="Mouvements">
        <EtatVide titre="Aucun mouvement sur cette période." description="Importe un relevé bancaire depuis l'écran Import." />
      </Card>
    )
  }

  return (
    <Card title="Mouvements" headerActions={filtres}>
      {mouvements.length === 0 ? (
        <EtatVide titre="Aucun mouvement ne correspond à ce filtre." />
      ) : (
        <div className="max-h-96 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-surface">
              <tr className="border-b border-bordure text-left text-xs font-medium uppercase text-texte-attenue">
                <th className="py-2 pr-4">Date</th>
                <th className="py-2 pr-4">Libellé</th>
                <th className="py-2 pr-4 text-right">Montant</th>
                <th className="py-2 pr-4">Catégorie</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-bordure">
              {mouvements.map((m) => (
                <tr key={m.id}>
                  <td className="py-2 pr-4 text-texte-attenue">{formatDate(m.date)}</td>
                  <td className="py-2 pr-4 text-texte">{m.libelle}</td>
                  <td className={`py-2 pr-4 text-right font-medium ${m.montant >= 0 ? 'text-positif' : 'text-texte'}`}>
                    {formatEuro(m.montant, 2, montantsMasques)}
                  </td>
                  <td className="py-2 pr-4">
                    <select
                      value={m.categorie_id ?? ''}
                      onChange={(e) => api.categoriserMouvement(m.id, e.target.value ? Number(e.target.value) : null).then(onCategorized)}
                      className="rounded-md border border-bordure bg-surface px-2 py-1 text-xs text-texte"
                    >
                      <option value="">Non catégorisé</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.parent_id !== null ? '↳ ' : ''}
                          {c.nom}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}
