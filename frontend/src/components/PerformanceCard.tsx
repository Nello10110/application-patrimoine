import type { PerformanceSummary } from '../api/types'
import Card from './Card'
import { usePreferencesAffichage } from '../hooks/usePreferencesAffichage'
import { formatEuro, formatPct } from '../utils/format'

export default function PerformanceCard({ performance }: { performance: PerformanceSummary }) {
  const { montantsMasques } = usePreferencesAffichage()
  const gainPositif = performance.gain_perte_total >= 0
  const couleurGain = gainPositif ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'

  return (
    <Card title="Rentabilité globale">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Valeur totale</p>
          <p className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-100">{formatEuro(performance.valeur_totale, 0, montantsMasques)}</p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Coût total investi</p>
          <p className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-100">
            {formatEuro(performance.cout_total_investi, 0, montantsMasques)}
          </p>
          {performance.premiere_transaction && (
            <p className="text-xs text-slate-500 dark:text-slate-400">depuis le {performance.premiere_transaction}</p>
          )}
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Gain / Perte total</p>
          <p className={`mt-1 text-xl font-semibold ${couleurGain}`}>
            {gainPositif ? '+' : ''}
            {formatEuro(performance.gain_perte_total, 0, montantsMasques)}
          </p>
          <p className={`text-xs ${couleurGain}`}>{formatPct(performance.rendement_simple_pct)}</p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Rendement annualisé</p>
          <p className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-100">
            {formatPct(performance.rendement_annualise_pct)}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">rendement money-weighted (XIRR)</p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 border-t border-slate-100 pt-4 sm:grid-cols-3 lg:grid-cols-6 dark:border-slate-700">
        <div>
          <p className="text-xs text-slate-500 dark:text-slate-400">Dividendes perçus (net)</p>
          <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{formatEuro(performance.dividendes_percus, 0, montantsMasques)}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500 dark:text-slate-400">Intérêts perçus (net)</p>
          <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{formatEuro(performance.interets_percus, 0, montantsMasques)}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500 dark:text-slate-400">Autres revenus</p>
          <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{formatEuro(performance.autres_revenus, 0, montantsMasques)}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500 dark:text-slate-400">Frais payés</p>
          <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{formatEuro(performance.frais_payes, 0, montantsMasques)}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500 dark:text-slate-400">Impôts prélevés</p>
          <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{formatEuro(performance.impots_preleves, 0, montantsMasques)}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500 dark:text-slate-400">Gains réalisés (ventes)</p>
          <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{formatEuro(performance.gains_realises, 0, montantsMasques)}</p>
        </div>
      </div>
    </Card>
  )
}
