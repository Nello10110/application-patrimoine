import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { HoldingDetail } from '../api/types'
import Card from './Card'
import HoldingPriceHistoryChart from './HoldingPriceHistoryChart'
import PieChartCard from './PieChartCard'
import { formatEuro, formatPct } from '../utils/format'

const CATEGORY_LABELS: Record<string, string> = {
  STOCK: 'Action',
  FUND: 'ETF / Fonds',
  CRYPTO: 'Crypto',
  BOND: 'Obligation',
  PRIVATE_FUND: 'Private Equity',
}

export default function HoldingDetailContent({ detail }: { detail: HoldingDetail }) {
  const gainPositif = (detail.rendement_depuis_achat_pct ?? 0) >= 0

  return (
    <div className="space-y-6">
      <div className="flex items-baseline gap-3">
        <h2 className="text-xl font-semibold text-slate-900">{detail.nom ?? detail.ticker}</h2>
        <span className="text-sm text-slate-500">{detail.ticker}</span>
        {detail.type_actif && (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
            {CATEGORY_LABELS[detail.type_actif] ?? detail.type_actif}
          </span>
        )}
      </div>

      <Card>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Quantité</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">{detail.quantite}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Prix de revient</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">{formatEuro(detail.prix_revient_moyen)}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Prix actuel</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">{formatEuro(detail.prix_actuel)}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Valeur</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">{formatEuro(detail.valeur)}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Depuis achat</p>
            <p className={`mt-1 text-lg font-semibold ${gainPositif ? 'text-emerald-600' : 'text-red-600'}`}>
              {formatPct(detail.rendement_depuis_achat_pct)}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Rendement annualisé</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">{formatPct(detail.rendement_annualise_pct)}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Secteur</p>
            <p className="mt-1 text-sm text-slate-700">{detail.secteur ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Pays</p>
            <p className="mt-1 text-sm text-slate-700">{detail.pays ?? '—'}</p>
          </div>
        </div>
      </Card>

      <HoldingPriceHistoryChart ticker={detail.ticker} />

      <Card title="Émetteur, résumé & frais">
        <div className="space-y-3 text-sm">
          {detail.emetteur && (
            <p>
              <span className="font-medium text-slate-700">Émetteur : </span>
              {detail.emetteur}
            </p>
          )}
          {detail.resume && <p className="text-slate-600">{detail.resume}</p>}
          {!detail.emetteur && !detail.resume && <p className="text-slate-500">Informations non disponibles.</p>}
          <div className="flex gap-6 border-t border-slate-100 pt-3">
            <div>
              <p className="text-xs text-slate-500">Frais de gestion annuels</p>
              <p className="font-medium text-slate-900">
                {detail.frais_gestion_pct !== null ? `${detail.frais_gestion_pct}%` : '—'}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Frais de transaction payés (cumulés)</p>
              <p className="font-medium text-slate-900">{formatEuro(detail.frais_transaction_payes)}</p>
            </div>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <PieChartCard title="Répartition géographique" items={detail.repartition_geo} />
        <PieChartCard title="Répartition sectorielle" items={detail.repartition_sector} />
      </div>

      {detail.composition_actions.length > 0 && (
        <Card title="Composition en actions (10 plus grosses lignes du fonds)">
          <ResponsiveContainer width="100%" height={Math.max(220, detail.composition_actions.length * 36)}>
            <BarChart data={detail.composition_actions} layout="vertical" margin={{ left: 24, right: 24 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" unit="%" tickFormatter={(v) => (v * 100).toFixed(0)} domain={[0, 'dataMax']} />
              <YAxis type="category" dataKey="symbol" width={70} tick={{ fontSize: 12 }} />
              <Tooltip formatter={(value) => `${(Number(value) * 100).toFixed(2)}%`} labelFormatter={(_, p) => p?.[0]?.payload?.nom ?? ''} />
              <Bar dataKey="poids" fill="#2563eb" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs font-medium uppercase text-slate-500">
                  <th className="py-2 pr-4">Action</th>
                  <th className="py-2 pr-4">Proportion</th>
                  <th className="py-2 pr-4">Pays</th>
                  <th className="py-2 pr-4">Secteur</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {detail.composition_actions.map((a) => (
                  <tr key={a.symbol}>
                    <td className="py-2 pr-4">
                      <span className="font-medium text-slate-900">{a.nom ?? a.symbol}</span>
                      <span className="ml-1 text-xs text-slate-400">{a.symbol}</span>
                    </td>
                    <td className="py-2 pr-4 text-slate-700">{(a.poids * 100).toFixed(2)}%</td>
                    <td className="py-2 pr-4 text-slate-600">{a.pays ?? '—'}</td>
                    <td className="py-2 pr-4 text-slate-600">{a.secteur ?? '—'}</td>
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
