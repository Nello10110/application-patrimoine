import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { PatrimoineNet } from '../api/types'
import { formatEuro } from '../utils/format'
import Card from './Card'
import StatTile from './StatTile'

/** Patrimoine net global (roadmap Phase 1) — actifs (portefeuille financier +
 * immobilier/SCPI/assurance-vie/PER) moins passifs (emprunts). Carte autonome,
 * indépendante de l'année sélectionnée et du reste du tableau de bord (comme
 * `PerformanceCard`) : chargée et affichée même si l'analyse géo/sectorielle
 * échoue, puisqu'elle ne dépend d'aucune des deux. */
export default function PatrimoineNetCard() {
  const [patrimoine, setPatrimoine] = useState<PatrimoineNet | null>(null)

  useEffect(() => {
    api.getPatrimoineNet().then(setPatrimoine).catch(() => setPatrimoine(null))
  }, [])

  // Rien à montrer tant qu'aucun actif n'a été ajouté nulle part (positions,
  // immobilier, épargne...) — pas de carte vide pour un portefeuille tout neuf.
  if (!patrimoine || (patrimoine.actifs_totaux === 0 && patrimoine.passifs_totaux === 0)) return null

  return (
    <Card title="Patrimoine net">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatTile label="Actifs totaux" value={formatEuro(patrimoine.actifs_totaux, 0)} />
        <StatTile label="Passifs (emprunts)" value={formatEuro(patrimoine.passifs_totaux, 0)} tone={patrimoine.passifs_totaux > 0 ? 'warning' : 'neutral'} />
        <StatTile label="Patrimoine net" value={formatEuro(patrimoine.patrimoine_net, 0)} tone="good" />
      </div>

      {patrimoine.repartition_par_classe.length > 0 && (
        <ul className="mt-4 divide-y divide-slate-100 border-t border-slate-100 pt-2 dark:divide-slate-700 dark:border-slate-700">
          {patrimoine.repartition_par_classe.map((item) => (
            <li key={item.categorie} className="flex items-center justify-between py-1.5 text-sm">
              <span className="text-slate-600 dark:text-slate-300">{item.categorie}</span>
              <span className="font-medium text-slate-900 dark:text-slate-100">{formatEuro(item.valeur, 0)}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
