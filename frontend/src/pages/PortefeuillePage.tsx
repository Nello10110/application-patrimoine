import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { Holding } from '../api/types'
import Card from '../components/Card'
import HoldingDetailModal from '../components/HoldingDetailModal'
import LoansCard from '../components/LoansCard'
import Modale from '../components/Modale'
import PositionsTable from '../components/PositionsTable'
import { useRafraichissementCours } from '../hooks/useRafraichissementCours'
import {
  CATEGORY_TABS,
  type Categorie,
  FILTRE_SANS_COMPTE,
  FILTRE_TOUS_COMPTES,
  SEUIL_PEREMPTION_HEURES,
  TYPE_ACTIF_OPTIONS,
  categorieDe,
  comptesDisponibles,
  correspondAuFiltreCompte,
  coursLePlusAncien,
} from '../utils/holdingCategories'
import { formatDateHeure, parseDateApi } from '../utils/format'

export default function PortefeuillePage() {
  const [holdings, setHoldings] = useState<Holding[]>([])
  const [categorie, setCategorie] = useState<Categorie>('TOUS')
  const [filtreCompte, setFiltreCompte] = useState<string>(FILTRE_TOUS_COMPTES)
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [form, setForm] = useState({ ticker: '', quantite: '', prix_revient_moyen: '', compte: '', type_actif: '', valeur_estimee: '' })
  const [saving, setSaving] = useState(false)

  // Confirmation de suppression (LOT 6.3) : remplace le `confirm()` natif du
  // navigateur par une modale de l'application (cohérente visuellement, testable).
  // Ne mémorise que ce qui est nécessaire à l'affichage du message et à l'appel API,
  // pas la ligne entière.
  const [confirmSuppression, setConfirmSuppression] = useState<{ id: number; ticker: string } | null>(null)
  const [suppressionEnCours, setSuppressionEnCours] = useState(false)

  function load() {
    setLoading(true)
    api
      .listHoldings()
      .then(setHoldings)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  // Rafraîchissement des cours en tâche de fond (LOT 4B) : recharge les positions
  // une fois le rafraîchissement terminé (succès ou échec), pour afficher les
  // cours à jour sans attendre une action supplémentaire de l'utilisateur.
  const { etat: etatRafraichissement, enCours: refreshing, erreur: erreurRafraichissement, declencher } =
    useRafraichissementCours(() => load())

  function handleRefresh() {
    declencher(() => api.refreshMarketData())
  }

  async function confirmerSuppression() {
    if (!confirmSuppression) return
    setSuppressionEnCours(true)
    try {
      await api.deleteHolding(confirmSuppression.id)
      setConfirmSuppression(null)
      load()
    } catch (err) {
      setError((err as Error).message)
      setConfirmSuppression(null)
    } finally {
      setSuppressionEnCours(false)
    }
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
        valeur_estimee: form.valeur_estimee ? Number(form.valeur_estimee) : null,
      })
      setForm({ ticker: '', quantite: '', prix_revient_moyen: '', compte: '', type_actif: '', valeur_estimee: '' })
      load()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const libelleRafraichissement =
    etatRafraichissement?.en_cours && etatRafraichissement.positions_total > 0
      ? `Rafraîchissement... (${etatRafraichissement.positions_traitees} / ${etatRafraichissement.positions_total} positions)`
      : 'Rafraîchissement...'

  const lignesFiltrees = holdings.filter(
    (h) => (categorie === 'TOUS' || categorieDe(h) === categorie) && correspondAuFiltreCompte(h, filtreCompte),
  )

  const dateCoursLePlusAncien = coursLePlusAncien(holdings)
  const coursPerimes = dateCoursLePlusAncien
    ? Date.now() - parseDateApi(dateCoursLePlusAncien).getTime() > SEUIL_PEREMPTION_HEURES * 60 * 60 * 1000
    : false

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Portefeuille</h2>
        <div className="flex items-center gap-3">
          {dateCoursLePlusAncien && (
            <span className={`text-xs ${coursPerimes ? 'text-amber-600 dark:text-amber-400' : 'text-slate-500 dark:text-slate-400'}`}>
              Cours à jour au {formatDateHeure(dateCoursLePlusAncien)}
            </span>
          )}
          <button
            onClick={handleRefresh}
            disabled={refreshing || holdings.length === 0}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40 dark:bg-slate-100 dark:text-slate-900"
          >
            {refreshing ? libelleRafraichissement : 'Rafraîchir les cours'}
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      {erreurRafraichissement && <p className="text-sm text-red-600 dark:text-red-400">{erreurRafraichissement}</p>}

      <Card title="Ajouter une ligne manuellement">
        <form onSubmit={handleAdd} className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-500 dark:text-slate-400">
            Ticker
            <input
              value={form.ticker}
              onChange={(e) => setForm({ ...form, ticker: e.target.value })}
              className="w-28 rounded-md border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
              placeholder="AAPL"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-500 dark:text-slate-400">
            Quantité
            <input
              value={form.quantite}
              onChange={(e) => setForm({ ...form, quantite: e.target.value })}
              type="number"
              step="any"
              className="w-28 rounded-md border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-500 dark:text-slate-400">
            Prix de revient
            <input
              value={form.prix_revient_moyen}
              onChange={(e) => setForm({ ...form, prix_revient_moyen: e.target.value })}
              type="number"
              step="any"
              className="w-32 rounded-md border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-500 dark:text-slate-400">
            Compte
            <input
              value={form.compte}
              onChange={(e) => setForm({ ...form, compte: e.target.value })}
              className="w-32 rounded-md border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
              placeholder="PEA, CTO..."
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-500 dark:text-slate-400">
            Type d'actif
            <select
              value={form.type_actif}
              onChange={(e) => setForm({ ...form, type_actif: e.target.value })}
              className="w-36 rounded-md border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
            >
              {TYPE_ACTIF_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-500 dark:text-slate-400">
            Valeur estimée
            <input
              value={form.valeur_estimee}
              onChange={(e) => setForm({ ...form, valeur_estimee: e.target.value })}
              type="number"
              step="any"
              className="w-32 rounded-md border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
              placeholder="optionnel"
            />
          </label>
          <button
            type="submit"
            disabled={saving}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-40 dark:bg-blue-500"
          >
            Ajouter
          </button>
        </form>
        <p className="mt-3 text-xs text-slate-400 dark:text-slate-500">
          Pour l'immobilier, une SCPI, une assurance-vie ou un PER : laisser Quantité à 1 et renseigner Valeur estimée — elle
          remplace le calcul prix × quantité et se met à jour à la main, périodiquement.
        </p>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1">
          {CATEGORY_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setCategorie(tab.key)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                categorie === tab.key
                  ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                  : 'bg-white text-slate-600 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {holdings.length > 0 && (
          <label className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
            Filtrer par compte
            <select
              value={filtreCompte}
              onChange={(e) => setFiltreCompte(e.target.value)}
              className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300"
            >
              <option value={FILTRE_TOUS_COMPTES}>Tous les comptes</option>
              {comptesDisponibles(holdings).map((compte) => (
                <option key={compte} value={compte}>
                  {compte}
                </option>
              ))}
              {holdings.some((h) => h.compte === null) && <option value={FILTRE_SANS_COMPTE}>Sans compte</option>}
            </select>
          </label>
        )}
      </div>

      <Card>
        {loading ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">Chargement...</p>
        ) : holdings.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">Aucune position. Ajoute une ligne ou importe un fichier.</p>
        ) : (
          <PositionsTable
            rows={lignesFiltrees}
            onSelectTicker={setSelectedTicker}
            onRequestDelete={(h) => setConfirmSuppression({ id: h.id, ticker: h.ticker })}
            onSaved={load}
          />
        )}
      </Card>

      <LoansCard />

      {selectedTicker && <HoldingDetailModal ticker={selectedTicker} onClose={() => setSelectedTicker(null)} />}

      {confirmSuppression && (
        <Modale onClose={() => setConfirmSuppression(null)} panelClassName="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
          {({ titleId }) => (
            <>
              <h2 id={titleId} className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                Supprimer cette ligne ?
              </h2>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                La ligne <span className="font-medium text-slate-900 dark:text-slate-100">{confirmSuppression.ticker}</span> sera
                définitivement supprimée du portefeuille.
              </p>
              <div className="mt-5 flex justify-end gap-2">
                <button
                  onClick={() => setConfirmSuppression(null)}
                  disabled={suppressionEnCours}
                  className="rounded-md px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-40 dark:text-slate-300 dark:hover:bg-slate-700"
                >
                  Annuler
                </button>
                <button
                  onClick={confirmerSuppression}
                  disabled={suppressionEnCours}
                  className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-40 dark:bg-red-600 dark:hover:bg-red-500"
                >
                  {suppressionEnCours ? 'Suppression...' : 'Supprimer'}
                </button>
              </div>
            </>
          )}
        </Modale>
      )}
    </div>
  )
}
