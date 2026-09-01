import { useState } from 'react'
import { api } from '../api/client'
import type { BudgetSummary } from '../api/types'
import Card from './Card'
import EtatVide from './EtatVide'
import { usePreferencesAffichage } from '../hooks/usePreferencesAffichage'
import { formatEuro } from '../utils/format'

/** Édition inline du budget cible d'une catégorie racine (backlog 2.N.2) — champ
 * texte local, enregistré sur perte de focus/Entrée plutôt qu'à chaque frappe. */
function CibleInput({ categorieId, valeurInitiale, onSaved }: { categorieId: number; valeurInitiale: number | null; onSaved: () => void }) {
  const [valeur, setValeur] = useState(valeurInitiale !== null ? String(valeurInitiale) : '')
  const [saving, setSaving] = useState(false)

  async function enregistrer() {
    const nombre = Number(valeur)
    if (valeur.trim() === '' || Number.isNaN(nombre) || nombre < 0) return
    setSaving(true)
    try {
      await api.setBudgetCible(categorieId, nombre)
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  return (
    <input
      type="number"
      min={0}
      step="any"
      value={valeur}
      disabled={saving}
      onChange={(e) => setValeur(e.target.value)}
      onBlur={enregistrer}
      onKeyDown={(e) => e.key === 'Enter' && enregistrer()}
      placeholder="—"
      className="w-24 rounded-md border border-bordure bg-surface px-2 py-1 text-right text-sm text-texte"
    />
  )
}

export default function RepartitionSection({ summary, onCibleChanged }: { summary: BudgetSummary; onCibleChanged: () => void }) {
  const { montantsMasques } = usePreferencesAffichage()

  if (summary.repartition_sorties.length === 0) {
    return (
      <Card title="Répartition des sorties">
        <EtatVide titre="Aucune sortie sur cette période." />
      </Card>
    )
  }

  return (
    <Card title="Répartition des sorties">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-bordure text-left text-xs font-medium uppercase text-texte-attenue">
            <th className="py-2 pr-4">Catégorie</th>
            <th className="py-2 pr-4 text-right">Montant</th>
            <th className="py-2 pr-4 text-right">Budget cible</th>
            <th className="py-2 pr-4 text-right">Écart</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-bordure">
          {summary.repartition_sorties.map((item) => {
            const ecart = item.cible_mensuelle !== null ? item.cible_mensuelle - item.montant : null
            return (
              <tr key={item.categorie_id ?? 'non-categorise'}>
                <td className="py-2 pr-4 text-texte">{item.categorie_nom}</td>
                <td className="py-2 pr-4 text-right text-texte">{formatEuro(item.montant, 2, montantsMasques)}</td>
                <td className="py-2 pr-4 text-right">
                  {item.categorie_id !== null ? (
                    <CibleInput categorieId={item.categorie_id} valeurInitiale={item.cible_mensuelle} onSaved={onCibleChanged} />
                  ) : (
                    '—'
                  )}
                </td>
                <td className={`py-2 pr-4 text-right font-medium ${ecart === null ? 'text-texte-attenue' : ecart >= 0 ? 'text-positif' : 'text-negatif'}`}>
                  {ecart !== null ? formatEuro(ecart, 2, montantsMasques) : '—'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </Card>
  )
}
