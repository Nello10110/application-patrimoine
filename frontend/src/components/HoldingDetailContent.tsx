import { useEffect, useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { api } from '../api/client'
import type { Detenteur, HoldingDetail } from '../api/types'
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

/** Répartition entre détenteurs (backlog 2.L.1) — n'apparaît que si l'utilisateur a
 * déclaré au moins un détenteur (Réglages). Gère son propre état, indépendant du
 * `detail` du composant parent : après enregistrement, recharge la fiche pour
 * obtenir la part détenue/nette à jour sans faire remonter l'état au parent. */
function DetenteursSection({ ticker, quotitesInitiales }: { ticker: string; quotitesInitiales: HoldingDetail['quotites'] }) {
  const { montantsMasques } = usePreferencesAffichage()
  const [detenteurs, setDetenteurs] = useState<Detenteur[]>([])
  const [saisie, setSaisie] = useState<Record<number, string>>({})
  const [quotitesEnregistrees, setQuotitesEnregistrees] = useState(quotitesInitiales)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .listDetenteurs()
      .then((liste) => {
        setDetenteurs(liste)
        const init: Record<number, string> = {}
        for (const q of quotitesInitiales) init[q.detenteur_id] = String(q.quotite_pct)
        setSaisie(init)
      })
      .catch(() => setDetenteurs([]))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `ticker` change = remontage du composant parent (route/modale), pas de resynchronisation nécessaire en cours de vie.
  }, [ticker])

  if (detenteurs.length === 0) return null

  const total = detenteurs.reduce((somme, d) => somme + (Number(saisie[d.id]) || 0), 0)
  const repartitionEnCours = detenteurs.some((d) => (Number(saisie[d.id]) || 0) > 0)
  const totalValide = !repartitionEnCours || Math.abs(total - 100) < 0.01

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      const quotites = detenteurs
        .map((d) => ({ detenteur_id: d.id, quotite_pct: Number(saisie[d.id]) || 0 }))
        .filter((q) => q.quotite_pct > 0)
      await api.setHoldingQuotites(ticker, quotites)
      const detailFrais = await api.getHoldingDetail(ticker)
      setQuotitesEnregistrees(detailFrais.quotites)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card title="Détenteurs">
      <p className="mb-4 text-sm text-texte">
        Répartition de cette ligne entre les personnes/sociétés déclarées dans Réglages — la somme doit faire 100 % (ou
        rester à 0 % pour ne pas répartir, 100 % foyer implicite).
      </p>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-bordure text-left text-xs font-medium uppercase text-texte-attenue">
            <th className="py-2 pr-4">Détenteur</th>
            <th className="py-2 pr-4">Quotité</th>
            <th className="py-2 pr-4 text-right">Part détenue</th>
            <th className="py-2 pr-4 text-right">Part nette</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-bordure">
          {detenteurs.map((d) => {
            const enregistree = quotitesEnregistrees.find((q) => q.detenteur_id === d.id)
            return (
              <tr key={d.id}>
                <td className="py-2 pr-4 text-texte">{d.nom}</td>
                <td className="py-2 pr-4">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step="any"
                    value={saisie[d.id] ?? ''}
                    onChange={(e) => setSaisie({ ...saisie, [d.id]: e.target.value })}
                    className="w-20 rounded-md border border-bordure bg-surface px-2 py-1 text-sm text-texte"
                  />
                  %
                </td>
                <td className="py-2 pr-4 text-right text-texte">
                  {enregistree ? formatEuro(enregistree.part_detenue, 2, montantsMasques) : '—'}
                </td>
                <td className="py-2 pr-4 text-right font-medium text-texte">
                  {enregistree ? formatEuro(enregistree.part_nette, 2, montantsMasques) : '—'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={!totalValide || saving}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-surface disabled:opacity-40"
        >
          Enregistrer
        </button>
        {!totalValide && <span className="text-sm text-negatif">Total actuel : {total.toFixed(2)} % (doit faire 100 %)</span>}
        {error && <span className="text-sm text-negatif">{error}</span>}
      </div>
    </Card>
  )
}

export default function HoldingDetailContent({ detail, titleId }: { detail: HoldingDetail; titleId?: string }) {
  const { montantsMasques } = usePreferencesAffichage()
  const gainPositif = (detail.rendement_depuis_achat_pct ?? 0) >= 0

  return (
    <div className="space-y-6">
      <div className="flex items-baseline gap-3">
        <h2 id={titleId} className="text-xl font-semibold text-texte">
          {detail.nom ?? detail.ticker}
        </h2>
        <span className="text-sm text-texte-attenue">{detail.ticker}</span>
        {detail.type_actif && (
          <span className="rounded-full bg-surface-elevee px-2 py-0.5 text-xs font-medium text-texte-attenue">
            {CATEGORY_LABELS[detail.type_actif] ?? detail.type_actif}
          </span>
        )}
      </div>

      <Card>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-texte-attenue">Quantité</p>
            <p className="mt-1 text-lg font-semibold text-texte">{formatQuantite(detail.quantite)}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-texte-attenue">Prix de revient</p>
            <p className="mt-1 text-lg font-semibold text-texte">{formatEuro(detail.prix_revient_moyen, 2, montantsMasques)}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-texte-attenue">Prix actuel</p>
            <p className="mt-1 text-lg font-semibold text-texte">{formatEuro(detail.prix_actuel, 2, montantsMasques)}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-texte-attenue">Valeur</p>
            <p className="mt-1 text-lg font-semibold text-texte">{formatEuro(detail.valeur, 2, montantsMasques)}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-texte-attenue">Depuis achat</p>
            <p className={`mt-1 text-lg font-semibold ${gainPositif ? 'text-positif' : 'text-negatif'}`}>
              {formatPct(detail.rendement_depuis_achat_pct)}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-texte-attenue">Rendement annualisé</p>
            <p className="mt-1 text-lg font-semibold text-texte">{formatPct(detail.rendement_annualise_pct)}</p>
            {detail.rendement_annualise_pct === null && (
              <p className="text-xs text-texte-attenue">
                indisponible : moins de 90 jours de détention, ou pas d'historique exploitable
              </p>
            )}
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-texte-attenue">Secteur</p>
            <p className="mt-1 text-sm text-texte">{detail.secteur ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-texte-attenue">Pays</p>
            <p className="mt-1 text-sm text-texte">{detail.pays ?? '—'}</p>
          </div>
        </div>
      </Card>

      <HoldingPriceHistoryChart ticker={detail.ticker} />

      <DetenteursSection ticker={detail.ticker} quotitesInitiales={detail.quotites} />

      <Card title="Émetteur, résumé & frais">
        <div className="space-y-3 text-sm">
          {detail.emetteur && (
            <p>
              <span className="font-medium text-texte">Émetteur : </span>
              {detail.emetteur}
            </p>
          )}
          {detail.resume && <p className="text-texte">{detail.resume}</p>}
          {!detail.emetteur && !detail.resume && <p className="text-texte-attenue">Informations non disponibles.</p>}
          <div className="flex gap-6 border-t border-bordure pt-3">
            <div>
              <p className="text-xs text-texte-attenue">Frais de gestion annuels</p>
              <p className="font-medium text-texte">
                {detail.frais_gestion_pct !== null ? `${detail.frais_gestion_pct}%` : '—'}
              </p>
            </div>
            <div>
              <p className="text-xs text-texte-attenue">Frais de transaction payés (cumulés)</p>
              <p className="font-medium text-texte">{formatEuro(detail.frais_transaction_payes, 2, montantsMasques)}</p>
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
                <tbody className="divide-y divide-bordure">
                  {[...detail.repartition_geo_detaillee]
                    .sort((a, b) => b.poids - a.poids)
                    .map((item) => (
                      <tr key={item.categorie}>
                        <td className="py-2 pr-4 text-texte">{item.categorie}</td>
                        <td className="py-2 text-right font-medium text-texte">{(item.poids * 100).toFixed(2)}%</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </Card>
          )}
          {detail.repartition_sector_detaillee.length > 0 && (
            <Card title="Répartition sectorielle détaillée">
              <table className="w-full text-sm">
                <tbody className="divide-y divide-bordure">
                  {[...detail.repartition_sector_detaillee]
                    .sort((a, b) => b.poids - a.poids)
                    .map((item) => (
                      <tr key={item.categorie}>
                        <td className="py-2 pr-4 text-texte">{item.categorie}</td>
                        <td className="py-2 text-right font-medium text-texte">{(item.poids * 100).toFixed(2)}%</td>
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
                <tr className="border-b border-bordure text-left text-xs font-medium uppercase text-texte-attenue">
                  <th className="py-2 pr-4">Action</th>
                  <th className="py-2 pr-4">Proportion</th>
                  <th className="py-2 pr-4">Pays</th>
                  <th className="py-2 pr-4">Secteur</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-bordure">
                {detail.composition_actions.map((a) => (
                  <tr key={a.symbol}>
                    <td className="py-2 pr-4">
                      <span className="font-medium text-texte">{a.nom ?? a.symbol}</span>
                      {/* Positions justETF (2.6) : pas de ticker Yahoo distinct, `symbol` porte
                        déjà le nom de l'entreprise — sous-titre redondant, donc masqué. */}
                      {a.symbol !== a.nom && <span className="ml-1 text-xs text-texte-attenue">{a.symbol}</span>}
                    </td>
                    <td className="py-2 pr-4 text-texte">{(a.poids * 100).toFixed(2)}%</td>
                    <td className="py-2 pr-4 text-texte-attenue">{a.pays ?? '—'}</td>
                    <td className="py-2 pr-4 text-texte-attenue">{a.secteur ?? '—'}</td>
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
