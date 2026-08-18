import type { PerformanceSummary } from '../api/types'
import Card from './Card'
import { formatEuro, formatPct } from '../utils/format'

export default function PerformanceCard({ performance }: { performance: PerformanceSummary }) {
  const gainPositif = performance.gain_perte_total >= 0

  return (
    <Card title="Rentabilité globale">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Valeur totale</p>
          <p className="mt-1 text-xl font-semibold text-slate-900">{formatEuro(performance.valeur_totale, 0)}</p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Coût total investi</p>
          <p className="mt-1 text-xl font-semibold text-slate-900">{formatEuro(performance.cout_total_investi, 0)}</p>
          {performance.premiere_transaction && (
            <p className="text-xs text-slate-500">depuis le {performance.premiere_transaction}</p>
          )}
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Gain / Perte total</p>
          <p className={`mt-1 text-xl font-semibold ${gainPositif ? 'text-emerald-600' : 'text-red-600'}`}>
            {gainPositif ? '+' : ''}
            {formatEuro(performance.gain_perte_total, 0)}
          </p>
          <p className={`text-xs ${gainPositif ? 'text-emerald-600' : 'text-red-600'}`}>
            {formatPct(performance.rendement_simple_pct)}
          </p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Rendement annualisé</p>
          <p className="mt-1 text-xl font-semibold text-slate-900">{formatPct(performance.rendement_annualise_pct)}</p>
          <p className="text-xs text-slate-500">rendement money-weighted (XIRR)</p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 border-t border-slate-100 pt-4 sm:grid-cols-4">
        <div>
          <p className="text-xs text-slate-500">Dividendes perçus</p>
          <p className="text-sm font-medium text-slate-900">{formatEuro(performance.dividendes_percus, 0)}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Intérêts perçus</p>
          <p className="text-sm font-medium text-slate-900">{formatEuro(performance.interets_percus, 0)}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Frais payés</p>
          <p className="text-sm font-medium text-slate-900">{formatEuro(performance.frais_payes, 0)}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Gains réalisés (ventes)</p>
          <p className="text-sm font-medium text-slate-900">{formatEuro(performance.gains_realises, 0)}</p>
        </div>
      </div>
    </Card>
  )
}
