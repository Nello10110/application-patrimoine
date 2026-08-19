import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { Holding } from '../api/types'
import Card from '../components/Card'
import HoldingDetailModal from '../components/HoldingDetailModal'
import { useRafraichissementCours } from '../hooks/useRafraichissementCours'
import { formatDateHeure, formatEuro, parseDateApi } from '../utils/format'

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

// Filtre par compte (LOT 5.1), combiné au filtre de catégorie ci-dessus. Le compte
// est une simple annotation manuelle par ligne (`Holding.compte`, cf. le formulaire
// d'ajout et l'édition en ligne) : ce filtre ne fait que répartir la valeur AFFICHÉE,
// il ne calcule aucune rentabilité par compte (impossible depuis le grand livre
// importé, cf. `GET /api/analysis/comptes`).
const FILTRE_TOUS_COMPTES = 'TOUS'
const FILTRE_SANS_COMPTE = 'SANS_COMPTE'

function comptesDisponibles(holdings: Holding[]): string[] {
  const comptes = new Set(holdings.map((h) => h.compte).filter((c): c is string => Boolean(c)))
  return Array.from(comptes).sort((a, b) => a.localeCompare(b, 'fr'))
}

function correspondAuFiltreCompte(h: Holding, filtreCompte: string): boolean {
  if (filtreCompte === FILTRE_TOUS_COMPTES) return true
  if (filtreCompte === FILTRE_SANS_COMPTE) return h.compte === null
  return h.compte === filtreCompte
}

// Valeur affichée/triée/sommée d'une ligne : prix actuel si connu, sinon prix de
// revient à défaut de cotation (même repli qu'à l'affichage du prix), `null` si ni
// l'un ni l'autre n'est disponible.
function valeurDe(h: Holding): number | null {
  const prix = h.market_data?.prix_actuel ?? h.prix_revient_moyen
  return prix !== null && prix !== undefined ? prix * h.quantite : null
}

type CleTri = 'ticker' | 'nom' | 'quantite' | 'prix_actuel' | 'valeur' | 'depuis_achat' | 'annualise'
type SensTri = 'asc' | 'desc'

interface ColonneTriable {
  cle: CleTri
  label: string
  valeur: (h: Holding) => string | number | null
}

// Colonnes triables (LOT 5.10) : ticker/nom (texte), quantité/prix actuel/valeur/
// rendements (nombre) — secteur et pays restent non triables (peu d'intérêt, la
// répartition géo/sectorielle est déjà visible sur le Tableau de bord).
const COLONNES_TRIABLES: ColonneTriable[] = [
  { cle: 'ticker', label: 'Ticker', valeur: (h) => h.ticker },
  { cle: 'nom', label: 'Nom', valeur: (h) => h.market_data?.nom ?? h.nom ?? null },
  { cle: 'quantite', label: 'Quantité', valeur: (h) => h.quantite },
  { cle: 'prix_actuel', label: 'Prix actuel', valeur: (h) => h.market_data?.prix_actuel ?? null },
  { cle: 'valeur', label: 'Valeur', valeur: valeurDe },
  { cle: 'depuis_achat', label: 'Depuis achat', valeur: (h) => h.rendement_depuis_achat_pct },
  { cle: 'annualise', label: 'Annualisé', valeur: (h) => h.rendement_annualise_pct },
]

// Une valeur nulle ("—" à l'écran) se trie toujours en fin de liste, quel que soit
// le sens demandé : `direction` n'intervient donc que sur la comparaison entre deux
// valeurs connues, jamais sur le traitement du `null`.
function comparerValeurs(a: string | number | null, b: string | number | null, direction: SensTri): number {
  if (a === null && b === null) return 0
  if (a === null) return 1
  if (b === null) return -1
  const brut = typeof a === 'string' && typeof b === 'string' ? a.localeCompare(b, 'fr') : (a as number) - (b as number)
  return direction === 'asc' ? brut : -brut
}

// Cours (`market_data.derniere_maj`) le plus ancien parmi les positions cotées
// (LOT 5.11) : reflète la fraîcheur globale de l'affichage, indépendamment du
// filtre de catégorie actif.
function coursLePlusAncien(holdings: Holding[]): string | null {
  const dates = holdings.map((h) => h.market_data?.derniere_maj).filter((d): d is string => Boolean(d))
  if (dates.length === 0) return null
  return dates.reduce((plusAncienne, courante) =>
    parseDateApi(courante).getTime() < parseDateApi(plusAncienne).getTime() ? courante : plusAncienne,
  )
}

const SEUIL_PEREMPTION_HEURES = 48

interface EditForm {
  quantite: string
  prix_revient_moyen: string
  compte: string
  type_actif: string
}

export default function PortefeuillePage() {
  const [holdings, setHoldings] = useState<Holding[]>([])
  const [categorie, setCategorie] = useState<Categorie>('TOUS')
  const [filtreCompte, setFiltreCompte] = useState<string>(FILTRE_TOUS_COMPTES)
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tri, setTri] = useState<{ cle: CleTri; direction: SensTri } | null>(null)

  const [form, setForm] = useState({ ticker: '', quantite: '', prix_revient_moyen: '', compte: '', type_actif: '' })
  const [saving, setSaving] = useState(false)

  // Édition en ligne (LOT 5.8) : une seule ligne éditable à la fois, identifiée par
  // son id. `editForm` reste des chaînes (comme le formulaire d'ajout) pour laisser
  // l'utilisateur taper librement (y compris un champ numérique vidé) sans que
  // `Number('')` (= 0) n'écrase la saisie en cours.
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editForm, setEditForm] = useState<EditForm>({ quantite: '', prix_revient_moyen: '', compte: '', type_actif: '' })
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

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

  function handleSort(cle: CleTri) {
    setTri((prev) => {
      if (prev && prev.cle === cle) return { cle, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
      return { cle, direction: 'asc' }
    })
  }

  // Piège du LOT 5.8 : la ligne est cliquable et ouvre la fiche détaillée. Chaque
  // contrôle d'édition appelle `e.stopPropagation()` pour ne jamais laisser le clic
  // remonter jusqu'au `onClick` de la ligne ; ce dernier est en plus neutralisé
  // explicitement pour la ligne en cours d'édition (double filet, cf. mission).
  function startEdit(e: React.MouseEvent, h: Holding) {
    e.stopPropagation()
    setEditingId(h.id)
    setEditForm({
      quantite: String(h.quantite),
      prix_revient_moyen: h.prix_revient_moyen !== null && h.prix_revient_moyen !== undefined ? String(h.prix_revient_moyen) : '',
      compte: h.compte ?? '',
      type_actif: h.type_actif ?? '',
    })
    setEditError(null)
  }

  function cancelEdit(e: React.MouseEvent) {
    e.stopPropagation()
    setEditingId(null)
    setEditError(null)
  }

  async function saveEdit(e: React.MouseEvent, id: number) {
    e.stopPropagation()
    setEditSaving(true)
    setEditError(null)
    try {
      await api.updateHolding(id, {
        quantite: Number(editForm.quantite),
        prix_revient_moyen: editForm.prix_revient_moyen ? Number(editForm.prix_revient_moyen) : null,
        compte: editForm.compte.trim() || null,
        type_actif: editForm.type_actif || null,
      })
      setEditingId(null)
      load()
    } catch (err) {
      // L'erreur (400 : quantité négative, etc.) reste affichée SANS quitter le mode
      // édition — l'utilisateur corrige sans avoir à ressaisir le reste du formulaire.
      setEditError((err as Error).message)
    } finally {
      setEditSaving(false)
    }
  }

  const libelleRafraichissement =
    etatRafraichissement?.en_cours && etatRafraichissement.positions_total > 0
      ? `Rafraîchissement... (${etatRafraichissement.positions_traitees} / ${etatRafraichissement.positions_total} positions)`
      : 'Rafraîchissement...'

  const lignesFiltrees = holdings.filter(
    (h) => (categorie === 'TOUS' || categorieDe(h) === categorie) && correspondAuFiltreCompte(h, filtreCompte),
  )
  const lignesAffichees = tri
    ? [...lignesFiltrees].sort((a, b) => {
        const colonne = COLONNES_TRIABLES.find((c) => c.cle === tri.cle)
        if (!colonne) return 0
        return comparerValeurs(colonne.valeur(a), colonne.valeur(b), tri.direction)
      })
    : lignesFiltrees
  const valeurTotaleAffichee = lignesFiltrees.reduce((somme, h) => somme + (valeurDe(h) ?? 0), 0)

  const dateCoursLePlusAncien = coursLePlusAncien(holdings)
  const coursPerimes = dateCoursLePlusAncien
    ? Date.now() - parseDateApi(dateCoursLePlusAncien).getTime() > SEUIL_PEREMPTION_HEURES * 60 * 60 * 1000
    : false

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-slate-900">Portefeuille</h2>
        <div className="flex items-center gap-3">
          {dateCoursLePlusAncien && (
            <span className={`text-xs ${coursPerimes ? 'text-amber-600' : 'text-slate-500'}`}>
              Cours à jour au {formatDateHeure(dateCoursLePlusAncien)}
            </span>
          )}
          <button
            onClick={handleRefresh}
            disabled={refreshing || holdings.length === 0}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            {refreshing ? libelleRafraichissement : 'Rafraîchir les cours'}
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {erreurRafraichissement && <p className="text-sm text-red-600">{erreurRafraichissement}</p>}

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

      <div className="flex flex-wrap items-center justify-between gap-3">
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

        {holdings.length > 0 && (
          <label className="flex items-center gap-2 text-xs font-medium text-slate-500">
            Filtrer par compte
            <select
              value={filtreCompte}
              onChange={(e) => setFiltreCompte(e.target.value)}
              className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-700"
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
          <p className="text-sm text-slate-500">Chargement...</p>
        ) : holdings.length === 0 ? (
          <p className="text-sm text-slate-500">Aucune position. Ajoute une ligne ou importe un fichier.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs font-medium uppercase text-slate-500">
                  {COLONNES_TRIABLES.map((col) => {
                    const triActif = tri?.cle === col.cle
                    return (
                      <th
                        key={col.cle}
                        scope="col"
                        onClick={() => handleSort(col.cle)}
                        aria-sort={triActif ? (tri.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
                        className="cursor-pointer select-none py-2 pr-4 hover:text-slate-700"
                      >
                        {col.label}
                        {triActif && <span className="ml-1">{tri.direction === 'asc' ? '▲' : '▼'}</span>}
                      </th>
                    )
                  })}
                  <th className="py-2 pr-4">Secteur</th>
                  <th className="py-2 pr-4">Pays</th>
                  <th className="py-2 pr-4"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {lignesAffichees.map((h) => {
                  const md = h.market_data
                  const valeur = valeurDe(h)
                  const enEdition = editingId === h.id
                  return (
                    <tr
                      key={h.id}
                      onClick={() => {
                        if (enEdition) return
                        setSelectedTicker(h.ticker)
                      }}
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
                      <td className="py-2 pr-4">
                        {enEdition ? (
                          <input
                            value={editForm.quantite}
                            onChange={(e) => setEditForm({ ...editForm, quantite: e.target.value })}
                            onClick={(e) => e.stopPropagation()}
                            type="number"
                            step="any"
                            aria-label="Quantité (édition)"
                            className="w-24 rounded-md border border-slate-300 px-2 py-1 text-sm"
                          />
                        ) : (
                          h.quantite
                        )}
                      </td>
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
                        {enEdition ? (
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={(e) => saveEdit(e, h.id)}
                              disabled={editSaving}
                              className="text-xs font-medium text-emerald-600 hover:underline disabled:opacity-40"
                            >
                              Enregistrer
                            </button>
                            <button onClick={(e) => cancelEdit(e)} className="text-xs text-slate-500 hover:underline">
                              Annuler
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-end gap-2">
                            <button onClick={(e) => startEdit(e, h)} className="text-xs text-slate-600 hover:underline">
                              Modifier
                            </button>
                            <button onClick={(e) => handleDelete(e, h.id)} className="text-xs text-red-600 hover:underline">
                              Supprimer
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
                {editingId !== null &&
                  lignesAffichees.some((h) => h.id === editingId) && (
                    <tr onClick={(e) => e.stopPropagation()}>
                      <td colSpan={10} className="bg-slate-50 py-3 pr-4">
                        <div className="flex flex-wrap items-end gap-3">
                          <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
                            Prix de revient
                            <input
                              value={editForm.prix_revient_moyen}
                              onChange={(e) => setEditForm({ ...editForm, prix_revient_moyen: e.target.value })}
                              onClick={(e) => e.stopPropagation()}
                              type="number"
                              step="any"
                              aria-label="Prix de revient (édition)"
                              className="w-32 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                            />
                          </label>
                          <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
                            Compte
                            <input
                              value={editForm.compte}
                              onChange={(e) => setEditForm({ ...editForm, compte: e.target.value })}
                              onClick={(e) => e.stopPropagation()}
                              aria-label="Compte (édition)"
                              className="w-32 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                            />
                          </label>
                          <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
                            Type d'actif
                            <select
                              value={editForm.type_actif}
                              onChange={(e) => setEditForm({ ...editForm, type_actif: e.target.value })}
                              onClick={(e) => e.stopPropagation()}
                              aria-label="Type d'actif (édition)"
                              className="w-36 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                            >
                              {TYPE_ACTIF_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>
                        {editError && <p className="mt-2 text-xs text-red-600">{editError}</p>}
                      </td>
                    </tr>
                  )}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-200 text-sm font-semibold text-slate-700">
                  <td colSpan={4} className="py-2 pr-4">
                    {lignesFiltrees.length} position{lignesFiltrees.length > 1 ? 's' : ''}
                  </td>
                  <td className="py-2 pr-4">{formatEuro(valeurTotaleAffichee)}</td>
                  <td colSpan={5}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>

      {selectedTicker && <HoldingDetailModal ticker={selectedTicker} onClose={() => setSelectedTicker(null)} />}
    </div>
  )
}
