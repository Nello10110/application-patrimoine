import type { CategorieBudget, RecurrenceDetectee } from '../api/types'
import Card from './Card'
import { usePreferencesAffichage } from '../hooks/usePreferencesAffichage'
import { formatEuro } from '../utils/format'

/** Charges récurrentes et abonnements (backlog 2.N.3) : sous-produit de l'import,
 * sur une fenêtre glissante indépendante de la période affichée à l'écran (un
 * abonnement mensuel reste un abonnement qu'on regarde 1 mois ou 1 an de budget). */
export default function RecurrencesSection({ recurrences, categories }: { recurrences: RecurrenceDetectee[]; categories: CategorieBudget[] }) {
  const { montantsMasques } = usePreferencesAffichage()

  if (recurrences.length === 0) return null

  return (
    <Card title="Charges récurrentes et abonnements">
      <p className="mb-3 text-xs text-texte-attenue">
        Détecté automatiquement sur les 12 derniers mois — mouvements revenant au moins deux fois sous le même libellé,
        encore vus au cours des 45 derniers jours.
      </p>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-bordure text-left text-xs font-medium uppercase text-texte-attenue">
            <th className="py-2 pr-4">Libellé</th>
            <th className="py-2 pr-4">Catégorie</th>
            <th className="py-2 pr-4">Périodicité</th>
            <th className="py-2 pr-4 text-right">Occurrences</th>
            <th className="py-2 pr-4 text-right">Montant</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-bordure">
          {recurrences.map((r) => {
            const categorie = categories.find((c) => c.id === r.categorie_id)
            return (
              <tr key={r.libelle}>
                <td className="py-2 pr-4 text-texte">{r.libelle}</td>
                <td className="py-2 pr-4 text-texte-attenue">{categorie?.nom ?? '—'}</td>
                <td className="py-2 pr-4 text-texte-attenue">{r.periodicite === 'mensuelle' ? 'Mensuelle' : 'Irrégulière'}</td>
                <td className="py-2 pr-4 text-right text-texte-attenue">{r.occurrences}</td>
                <td className="py-2 pr-4 text-right">
                  <span className="font-medium text-texte">{formatEuro(r.montant_actuel, 2, montantsMasques)}</span>
                  {r.hausse_prix && (
                    <span className="ml-2 rounded-full bg-avertissement/15 px-2 py-0.5 text-xs font-medium text-avertissement">
                      Hausse de prix
                    </span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </Card>
  )
}
