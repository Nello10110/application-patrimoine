import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { HoldingDetail } from '../api/types'
import Card from './Card'
import HoldingPriceHistoryChart from './HoldingPriceHistoryChart'
import PieChartCard from './PieChartCard'
import { usePreferencesAffichage } from '../hooks/usePreferencesAffichage'
import { formatEuro, formatPct, formatQuantite } from '../utils/format'
import { COULEUR_AXE, COULEUR_GRILLE, STYLE_INFOBULLE, STYLE_TICK_AXE } from '../utils/chartTheme'

const CATEGORY_LABELS: Record<string, string> = {
  STOCK: 'Action',
  FUND: 'ETF / Fonds',
  CRYPTO: 'Crypto',
  BOND: 'Obligation',
  PRIVATE_FUND: 'Private Equity',
}

export default function HoldingDetailContent({ detail, titleId }: { detail: HoldingDetail; titleId?: string }) {
  const { montantsMasques } = usePreferencesAffichage()
  const gainPositif = (detail.rendement_depuis_achat_pct ?? 0) >= 0

  return (
    <div className="space-y-6">
      <div className="flex items-baseline gap-3">
        <h2 id={titleId} className="text-xl font-semibold text-slate-900 dark:text-slate-100">
          {detail.nom ?? detail.ticker}
        </h2>
        <span className="text-sm text-slate-500 dark:text-slate-400">{detail.ticker}</span>
        {detail.type_actif && (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-300">
            {CATEGORY_LABELS[detail.type_actif] ?? detail.type_actif}
          </span>
        )}
      </div>

      <Card>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Quantité</p>
            <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">{formatQuantite(detail.quantite)}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Prix de revient</p>
            <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">{formatEuro(detail.prix_revient_moyen, 2, montantsMasques)}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Prix actuel</p>
            <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">{formatEuro(detail.prix_actuel, 2, montantsMasques)}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Valeur</p>
            <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">{formatEuro(detail.valeur, 2, montantsMasques)}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Depuis achat</p>
            <p className={`mt-1 text-lg font-semibold ${gainPositif ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
              {formatPct(detail.rendement_depuis_achat_pct)}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Rendement annualisé</p>
            <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">{formatPct(detail.rendement_annualise_pct)}</p>
            {detail.rendement_annualise_pct === null && (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                indisponible : moins de 90 jours de détention, ou pas d'historique exploitable
              </p>
            )}
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Secteur</p>
            <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">{detail.secteur ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Pays</p>
            <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">{detail.pays ?? '—'}</p>
          </div>
        </div>
      </Card>

      <HoldingPriceHistoryChart ticker={detail.ticker} />

      <Card title="Émetteur, résumé & frais">
        <div className="space-y-3 text-sm">
          {detail.emetteur && (
            <p>
              <span className="font-medium text-slate-700 dark:text-slate-300">Émetteur : </span>
              {detail.emetteur}
            </p>
          )}
          {detail.resume && <p className="text-slate-600 dark:text-slate-300">{detail.resume}</p>}
          {!detail.emetteur && !detail.resume && <p className="text-slate-500 dark:text-slate-400">Informations non disponibles.</p>}
          <div className="flex gap-6 border-t border-slate-100 pt-3 dark:border-slate-700">
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">Frais de gestion annuels</p>
              <p className="font-medium text-slate-900 dark:text-slate-100">
                {detail.frais_gestion_pct !== null ? `${detail.frais_gestion_pct}%` : '—'}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">Frais de transaction payés (cumulés)</p>
              <p className="font-medium text-slate-900 dark:text-slate-100">{formatEuro(detail.frais_transaction_payes, 2, montantsMasques)}</p>
            </div>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <PieChartCard title="Répartition géographique" items={detail.repartition_geo} />
        <PieChartCard title="Répartition sectorielle" items={detail.repartition_sector} />
      </div>

      {(detail.repartition_geo_detaillee.length > 0 || detail.repartition_sector_detaillee.length > 0) && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {detail.repartition_geo_detaillee.length > 0 && (
            <Card title="Répartition géographique détaillée">
              <table className="w-full text-sm">
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {[...detail.repartition_geo_detaillee]
                    .sort((a, b) => b.poids - a.poids)
                    .map((item) => (
                      <tr key={item.categorie}>
                        <td className="py-2 pr-4 text-slate-700 dark:text-slate-300">{item.categorie}</td>
                        <td className="py-2 text-right font-medium text-slate-900 dark:text-slate-100">{(item.poids * 100).toFixed(2)}%</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </Card>
          )}
          {detail.repartition_sector_detaillee.length > 0 && (
            <Card title="Répartition sectorielle détaillée">
              <table className="w-full text-sm">
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {[...detail.repartition_sector_detaillee]
                    .sort((a, b) => b.poids - a.poids)
                    .map((item) => (
                      <tr key={item.categorie}>
                        <td className="py-2 pr-4 text-slate-700 dark:text-slate-300">{item.categorie}</td>
                        <td className="py-2 text-right font-medium text-slate-900 dark:text-slate-100">{(item.poids * 100).toFixed(2)}%</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </Card>
          )}
        </div>
      )}

      {detail.composition_actions.length > 0 && (
        <Card title="Composition en actions (10 plus grosses lignes du fonds)">
          <ResponsiveContainer width="100%" height={Math.max(220, detail.composition_actions.length * 36)}>
            <BarChart data={detail.composition_actions} layout="vertical" margin={{ left: 24, right: 24 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={COULEUR_GRILLE} />
              <XAxis
                type="number"
                unit="%"
                tickFormatter={(v) => (v * 100).toFixed(0)}
                domain={[0, 'dataMax']}
                stroke={COULEUR_AXE}
                tick={STYLE_TICK_AXE}
              />
              <YAxis
                type="category"
                dataKey="symbol"
                width={120}
                tickFormatter={(v: string) => (v.length > 16 ? `${v.slice(0, 15)}…` : v)}
                tick={{ fontSize: 11, ...STYLE_TICK_AXE }}
                stroke={COULEUR_AXE}
              />
              <Tooltip
                formatter={(value) => `${(Number(value) * 100).toFixed(2)}%`}
                labelFormatter={(_, p) => p?.[0]?.payload?.nom ?? ''}
                {...STYLE_INFOBULLE}
              />
              <Bar dataKey="poids" fill="#2563eb" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs font-medium uppercase text-slate-500 dark:border-slate-700 dark:text-slate-400">
                  <th className="py-2 pr-4">Action</th>
                  <th className="py-2 pr-4">Proportion</th>
                  <th className="py-2 pr-4">Pays</th>
                  <th className="py-2 pr-4">Secteur</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {detail.composition_actions.map((a) => (
                  <tr key={a.symbol}>
                    <td className="py-2 pr-4">
                      <span className="font-medium text-slate-900 dark:text-slate-100">{a.nom ?? a.symbol}</span>
                      {/* Positions justETF (2.6) : pas de ticker Yahoo distinct, `symbol` porte
                        déjà le nom de l'entreprise — sous-titre redondant, donc masqué. */}
                      {a.symbol !== a.nom && <span className="ml-1 text-xs text-slate-400 dark:text-slate-500">{a.symbol}</span>}
                    </td>
                    <td className="py-2 pr-4 text-slate-700 dark:text-slate-300">{(a.poids * 100).toFixed(2)}%</td>
                    <td className="py-2 pr-4 text-slate-600 dark:text-slate-400">{a.pays ?? '—'}</td>
                    <td className="py-2 pr-4 text-slate-600 dark:text-slate-400">{a.secteur ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}
