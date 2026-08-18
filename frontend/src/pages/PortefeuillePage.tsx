import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { Holding } from '../api/types'
import Card from '../components/Card'
import HoldingDetailModal from '../components/HoldingDetailModal'
import { formatEuro } from '../utils/format'

function RendementCell({ value }: { value: number | null }) {
  if (value === null) return <span className="text-slate-400">—</span>
  const positif = value >= 0
  return <span className={positif ? 'text-emerald-600' : 'text-red-600'}>{`${positif ? '+' : ''}${value.toFixed(1)}%`}</span>
}

type Categorie = 'TOUS' | 'STOCK' | 'FUND' | 'CRYPTO' | 'AUTRES'

const CATEGORY_TABS: { key: Categorie; label: string }[] = [
  { key: 'TOUS', label: 'Tous' },
  { key: 'STOCK', label: 'Actions' },
  { key: 'FUND', label: 'ETF' },
  { key: 'CRYPTO', label: 'Crypto' },
  { key: 'AUTRES', label: 'Autres' },
]

// Valeurs acceptées par le backend (cf. `Holding.type_actif` dans `models.py`) : une
// ligne saisie à la main sans type explicite finit en "Autres" côté filtrage et
// échappe au look-through par catégorie — d'où l'option "Non précisé" plutôt qu'un
// type par défaut implicite.
const TYPE_ACTIF_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Non précisé' },
  { value: 'STOCK', label: 'Action' },
  { value: 'FUND', label: 'ETF / Fonds' },
  { value: 'CRYPTO', label: 'Crypto' },
  { value: 'BOND', label: 'Obligation' },
  { value: 'PRIVATE_FUND', label: 'Private Equity' },
]

function categorieDe(h: Holding): Categorie {
  if (h.type_actif === 'STOCK' || h.type_actif === 'FUND' || h.type_actif === 'CRYPTO') return h.type_actif
  return 'AUTRES'
}

export default function PortefeuillePage() {
  const [holdings, setHoldings] = useState<Holding[]>([])
  const [categorie, setCategorie] = useState<Categorie>('TOUS')
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [form, setForm] = useState({ ticker: '', quantite: '', prix_revient_moyen: '', compte: '', type_actif: '' })
  const [saving, setSaving] = useState(false)

  function load() {
    setLoading(true)
    api
      .listHoldings()
      .then(setHoldings)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  async function handleRefresh() {
    setRefreshing(true)
    setError(null)
    try {
      await api.refreshMarketData()
      load()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setRefreshing(false)
    }
  }

  async function handleDelete(e: React.MouseEvent, id: number) {
    e.stopPropagation()
    if (!confirm('Supprimer cette ligne ?')) return
    await api.deleteHolding(id)
    load()
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!form.ticker.trim() || !form.quantite) return
    setSaving(true)
    setError(null)
    try {
      await api.createHolding({
        ticker: form.ticker.trim().toUpperCase(),
        quantite: Number(form.quantite),
        prix_revient_moyen: form.prix_revient_moyen ? Number(form.prix_revient_moyen) : null,
        compte: form.compte.trim() || null,
        type_actif: form.type_actif || null,
      })
      setForm({ ticker: '', quantite: '', prix_revient_moyen: '', compte: '', type_actif: '' })
      load()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-slate-900">Portefeuille</h2>
        <button
          onClick={handleRefresh}
          disabled={refreshing || holdings.length === 0}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          {refreshing ? 'Rafraîchissement...' : 'Rafraîchir les cours'}
        </button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <Card title="Ajouter une ligne manuellement">
        <form onSubmit={handleAdd} className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
            Ticker
            <input
              value={form.ticker}
              onChange={(e) => setForm({ ...form, ticker: e.target.value })}
              className="w-28 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              placeholder="AAPL"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
            Quantité
            <input
              value={form.quantite}
              onChange={(e) => setForm({ ...form, quantite: e.target.value })}
              type="number"
              step="any"
              className="w-28 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
            Prix de revient
            <input
              value={form.prix_revient_moyen}
              onChange={(e) => setForm({ ...form, prix_revient_moyen: e.target.value })}
              type="number"
              step="any"
              className="w-32 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
            Compte
            <input
              value={form.compte}
              onChange={(e) => setForm({ ...form, compte: e.target.value })}
              className="w-32 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              placeholder="PEA, CTO..."
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
            Type d'actif
            <select
              value={form.type_actif}
              onChange={(e) => setForm({ ...form, type_actif: e.target.value })}
              className="w-36 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            >
              {TYPE_ACTIF_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            disabled={saving}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            Ajouter
          </button>
        </form>
      </Card>

      <div className="flex gap-1">
        {CATEGORY_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setCategorie(tab.key)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              categorie === tab.key ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-100'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <Card>
        {loading ? (
          <p className="text-sm text-slate-500">Chargement...</p>
        ) : holdings.length === 0 ? (
          <p className="text-sm text-slate-500">Aucune position. Ajoute une ligne ou importe un fichier.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs font-medium uppercase text-slate-500">
                  <th className="py-2 pr-4">Ticker</th>
                  <th className="py-2 pr-4">Nom</th>
                  <th className="py-2 pr-4">Quantité</th>
                  <th className="py-2 pr-4">Prix actuel</th>
                  <th className="py-2 pr-4">Valeur</th>
                  <th className="py-2 pr-4">Depuis achat</th>
                  <th className="py-2 pr-4">Annualisé</th>
                  <th className="py-2 pr-4">Secteur</th>
                  <th className="py-2 pr-4">Pays</th>
                  <th className="py-2 pr-4"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {holdings
                  .filter((h) => categorie === 'TOUS' || categorieDe(h) === categorie)
                  .map((h) => {
                    const md = h.market_data
                    const prix = md?.prix_actuel ?? h.prix_revient_moyen
                    const valeur = prix !== null && prix !== undefined ? prix * h.quantite : null
                    return (
                      <tr
                        key={h.id}
                        onClick={() => setSelectedTicker(h.ticker)}
                        className="cursor-pointer hover:bg-slate-50"
                      >
                        <td className="py-2 pr-4 font-medium text-slate-900">
                          {h.ticker}
                          {h.origine === 'manuel' && (
                            <span
                              title="Ligne saisie manuellement : non recalculée par un import de transactions"
                              className="ml-2 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-normal uppercase tracking-wide text-slate-500"
                            >
                              saisie manuelle
                            </span>
                          )}
                        </td>
                        <td className="py-2 pr-4 text-slate-600">{md?.nom ?? h.nom ?? '—'}</td>
                        <td className="py-2 pr-4">{h.quantite}</td>
                        <td className="py-2 pr-4">{formatEuro(md?.prix_actuel ?? null)}</td>
                        <td className="py-2 pr-4">{formatEuro(valeur)}</td>
                        <td className="py-2 pr-4">
                          <RendementCell value={h.rendement_depuis_achat_pct} />
                        </td>
                        <td className="py-2 pr-4">
                          <RendementCell value={h.rendement_annualise_pct} />
                        </td>
                        <td className="py-2 pr-4 text-slate-600">{md?.secteur ?? '—'}</td>
                        <td className="py-2 pr-4 text-slate-600">
                          {md?.erreur ? <span className="text-amber-600">{md.erreur}</span> : md?.pays ?? '—'}
                        </td>
                        <td className="py-2 pr-4 text-right">
                          <button onClick={(e) => handleDelete(e, h.id)} className="text-xs text-red-600 hover:underline">
                            Supprimer
                          </button>
                        </td>
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {selectedTicker && <HoldingDetailModal ticker={selectedTicker} onClose={() => setSelectedTicker(null)} />}
    </div>
  )
}
