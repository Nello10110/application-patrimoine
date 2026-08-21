import type { PerformanceSummary } from '../api/types'
import Card from './Card'
import { usePreferencesAffichage } from '../hooks/usePreferencesAffichage'
import { formatEuro, formatPct } from '../utils/format'

export default function PerformanceCard({ performance }: { performance: PerformanceSummary }) {
  const { montantsMasques } = usePreferencesAffichage()
  const gainPositif = performance.gain_perte_total >= 0
  const couleurGain = gainPositif ? 'text-positif' : 'text-negatif'

  return (
    <Card title="Rentabilité globale">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-texte-attenue">Valeur totale</p>
          <p className="mt-1 text-xl font-semibold text-texte">{formatEuro(performance.valeur_totale, 0, montantsMasques)}</p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-texte-attenue">Coût total investi</p>
          <p className="mt-1 text-xl font-semibold text-texte">
            {formatEuro(performance.cout_total_investi, 0, montantsMasques)}
          </p>
          {performance.premiere_transaction && (
            <p className="text-xs text-texte-attenue">depuis le {performance.premiere_transaction}</p>
          )}
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-texte-attenue">Gain / Perte total</p>
          <p className={`mt-1 text-xl font-semibold ${couleurGain}`}>
            {gainPositif ? '+' : ''}
            {formatEuro(performance.gain_perte_total, 0, montantsMasques)}
          </p>
          <p className={`text-xs ${couleurGain}`}>{formatPct(performance.rendement_simple_pct)}</p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-texte-attenue">Rendement annualisé</p>
          <p className="mt-1 text-xl font-semibold text-texte">
            {formatPct(performance.rendement_annualise_pct)}
          </p>
          <p className="text-xs text-texte-attenue">rendement money-weighted (XIRR)</p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 border-t border-bordure pt-4 sm:grid-cols-3 lg:grid-cols-6">
        <div>
          <p className="text-xs text-texte-attenue">Dividendes perçus (net)</p>
          <p className="text-sm font-medium text-texte">{formatEuro(performance.dividendes_percus, 0, montantsMasques)}</p>
        </div>
        <div>
          <p className="text-xs text-texte-attenue">Intérêts perçus (net)</p>
          <p className="text-sm font-medium text-texte">{formatEuro(performance.interets_percus, 0, montantsMasques)}</p>
        </div>
        <div>
          <p className="text-xs text-texte-attenue">Autres revenus</p>
          <p className="text-sm font-medium text-texte">{formatEuro(performance.autres_revenus, 0, montantsMasques)}</p>
        </div>
        <div>
          <p className="text-xs text-texte-attenue">Frais payés</p>
          <p className="text-sm font-medium text-texte">{formatEuro(performance.frais_payes, 0, montantsMasques)}</p>
        </div>
        <div>
          <p className="text-xs text-texte-attenue">Impôts prélevés</p>
          <p className="text-sm font-medium text-texte">{formatEuro(performance.impots_preleves, 0, montantsMasques)}</p>
        </div>
        <div>
          <p className="text-xs text-texte-attenue">Gains réalisés (ventes)</p>
          <p className="text-sm font-medium text-texte">{formatEuro(performance.gains_realises, 0, montantsMasques)}</p>
        </div>
      </div>
    </Card>
  )
}
