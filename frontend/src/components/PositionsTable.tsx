import { useState } from 'react'
import { api } from '../api/client'
import type { Holding } from '../api/types'
import { useEstMobile } from '../hooks/useEstMobile'
import { usePreferencesAffichage } from '../hooks/usePreferencesAffichage'
import {
  TEXTE_PRIX_REVIENT,
  TEXTE_VALEUR_ESTIMEE,
  TYPES_PATRIMOINE,
  TYPE_ACTIF_OPTIONS,
  TYPES_AVEC_TAUX,
  libelleTaux,
  valeurProjeteeUnAn,
} from '../utils/holdingCategories'
import { formatDate, formatEuro, formatQuantite } from '../utils/format'
import InfoBulle from './InfoBulle'

function RendementCell({ value }: { value: number | null }) {
  if (value === null) return <span className="text-texte-attenue">—</span>
  const positif = value >= 0
  return (
    <span className={positif ? 'text-positif' : 'text-negatif'}>{`${positif ? '+' : ''}${value.toFixed(1)}%`}</span>
  )
}

type CleTri = 'ticker' | 'nom' | 'quantite' | 'prix_actuel' | 'valeur' | 'depuis_achat' | 'annualise'
type SensTri = 'asc' | 'desc'

// Tri persisté dans `sessionStorage` (backlog 2.K.2) : une préférence de PRÉSENTATION
// pure (pas un filtre de données), qui ne mérite donc pas de polluer l'URL comme
// `categorie`/`compte` (cf. `PortefeuillePage`) — `sessionStorage`, pas `localStorage`
// comme les préférences durables de `PreferencesAffichageContext` : un état de la
// session de navigation en cours, pas une préférence utilisateur au long cours.
const CLE_TRI = 'patrimoine:positions-tri'

function triStocke(): { cle: CleTri; direction: SensTri } | null {
  if (typeof window === 'undefined') return null
  try {
    const brut = window.sessionStorage.getItem(CLE_TRI)
    return brut ? JSON.parse(brut) : null
  } catch {
    return null
  }
}

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
  { cle: 'valeur', label: 'Valeur', valeur: (h) => h.valeur },
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

interface EditForm {
  quantite: string
  prix_revient_moyen: string
  compte: string
  type_actif: string
  valeur_estimee: string
  taux_pct: string
  date_acquisition: string
}

/** Une position, en carte (backlog 2.K.4, < 768 px) — remplace la ligne de tableau
 * sur mobile plutôt que de la laisser défiler horizontalement. Même état d'édition
 * (`editForm`/handlers) que la vue desktop, juste un autre agencement : tous les
 * champs modifiables sont empilés dans une seule carte plutôt que répartis entre la
 * ligne principale (quantité) et la ligne développée (le reste). */
function PositionCard({
  h,
  enEdition,
  editForm,
  setEditForm,
  editSaving,
  editError,
  montantsMasques,
  onSelect,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onDelete,
}: {
  h: Holding
  enEdition: boolean
  editForm: EditForm
  setEditForm: (f: EditForm) => void
  editSaving: boolean
  editError: string | null
  montantsMasques: boolean
  onSelect: () => void
  onStartEdit: (e: React.MouseEvent) => void
  onCancelEdit: (e: React.MouseEvent) => void
  onSaveEdit: (e: React.MouseEvent) => void
  onDelete: (e: React.MouseEvent) => void
}) {
  const md = h.market_data

  if (enEdition) {
    return (
      <div className="rounded-lg border border-bordure bg-surface p-4">
        <p className="mb-3 font-medium text-texte">{h.ticker}</p>
        <div className="space-y-3">
          <label className="flex flex-col gap-1 text-xs font-medium text-texte-attenue">
            Quantité
            <input
              value={editForm.quantite}
              onChange={(e) => setEditForm({ ...editForm, quantite: e.target.value })}
              type="number"
              step="any"
              aria-label="Quantité (édition)"
              className="w-full rounded-md border border-bordure bg-surface px-3 py-2 text-sm text-texte"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-texte-attenue">
            <span className="inline-flex items-center gap-1">
              Prix de revient
              <InfoBulle texte={TEXTE_PRIX_REVIENT} />
            </span>
            <input
              value={editForm.prix_revient_moyen}
              onChange={(e) => setEditForm({ ...editForm, prix_revient_moyen: e.target.value })}
              type="number"
              step="any"
              aria-label="Prix de revient (édition)"
              className="w-full rounded-md border border-bordure bg-surface px-3 py-2 text-sm text-texte"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-texte-attenue">
            Compte
            <input
              value={editForm.compte}
              onChange={(e) => setEditForm({ ...editForm, compte: e.target.value })}
              aria-label="Compte (édition)"
              className="w-full rounded-md border border-bordure bg-surface px-3 py-2 text-sm text-texte"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-texte-attenue">
            Type d'actif
            <select
              value={editForm.type_actif}
              onChange={(e) => setEditForm({ ...editForm, type_actif: e.target.value })}
              aria-label="Type d'actif (édition)"
              className="w-full rounded-md border border-bordure bg-surface px-3 py-2 text-sm text-texte"
            >
              {TYPE_ACTIF_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-texte-attenue">
            <span className="inline-flex items-center gap-1">
              Valeur estimée
              <InfoBulle texte={TEXTE_VALEUR_ESTIMEE} />
            </span>
            <input
              value={editForm.valeur_estimee}
              onChange={(e) => setEditForm({ ...editForm, valeur_estimee: e.target.value })}
              type="number"
              step="any"
              aria-label="Valeur estimée (édition)"
              placeholder="optionnel"
              className="w-full rounded-md border border-bordure bg-surface px-3 py-2 text-sm text-texte"
            />
          </label>
          {TYPES_AVEC_TAUX.has(editForm.type_actif) && (
            <label className="flex flex-col gap-1 text-xs font-medium text-texte-attenue">
              {libelleTaux(editForm.type_actif)}
              <input
                value={editForm.taux_pct}
                onChange={(e) => setEditForm({ ...editForm, taux_pct: e.target.value })}
                type="number"
                step="any"
                aria-label="Taux annuel (édition)"
                placeholder={editForm.type_actif === 'VEHICLE' ? '-15' : '3'}
                className="w-full rounded-md border border-bordure bg-surface px-3 py-2 text-sm text-texte"
              />
            </label>
          )}
          {TYPES_PATRIMOINE.has(editForm.type_actif) && (
            <label className="flex flex-col gap-1 text-xs font-medium text-texte-attenue">
              Date d'acquisition
              <input
                value={editForm.date_acquisition}
                onChange={(e) => setEditForm({ ...editForm, date_acquisition: e.target.value })}
                type="date"
                aria-label="Date d'acquisition (édition)"
                className="w-full rounded-md border border-bordure bg-surface px-3 py-2 text-sm text-texte"
              />
            </label>
          )}
        </div>

        {TYPES_AVEC_TAUX.has(editForm.type_actif) &&
          valeurProjeteeUnAn(
            editForm.valeur_estimee ? Number(editForm.valeur_estimee) : null,
            editForm.taux_pct ? Number(editForm.taux_pct) : null,
          ) !== null && (
            <p className="mt-2 text-xs text-texte-attenue">
              Valeur projetée dans 1 an (indicatif) :{' '}
              {valeurProjeteeUnAn(Number(editForm.valeur_estimee), Number(editForm.taux_pct))?.toLocaleString('fr-FR', {
                style: 'currency',
                currency: 'EUR',
                maximumFractionDigits: 0,
              })}
            </p>
          )}
        {editError && <p className="mt-2 text-xs text-negatif">{editError}</p>}

        <div className="mt-4 flex gap-2">
          <button
            onClick={onSaveEdit}
            disabled={editSaving}
            className="min-h-11 flex-1 rounded-md bg-accent px-3 text-sm font-medium text-surface disabled:opacity-40"
          >
            Enregistrer
          </button>
          <button onClick={onCancelEdit} className="min-h-11 flex-1 rounded-md border border-bordure px-3 text-sm font-medium text-texte">
            Annuler
          </button>
        </div>
      </div>
    )
  }

  return (
    <div onClick={onSelect} className="rounded-lg border border-bordure bg-surface p-4 active:bg-surface-elevee">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium text-texte">
            {h.ticker}
            {h.origine === 'manuel' && (
              <span
                title="Ligne saisie manuellement : non recalculée par un import de transactions"
                className="ml-2 rounded-full bg-surface-elevee px-1.5 py-0.5 text-[10px] font-normal uppercase tracking-wide text-texte-attenue"
              >
                saisie manuelle
              </span>
            )}
          </p>
          <p className="truncate text-sm text-texte-attenue">{md?.nom ?? h.nom ?? '—'}</p>
          {h.date_acquisition && <p className="text-xs text-texte-attenue">Acquis le {formatDate(h.date_acquisition)}</p>}
        </div>
        <span className="shrink-0 font-medium text-texte">{formatEuro(h.valeur, 2, montantsMasques)}</span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
        <div>
          <span className="block text-xs text-texte-attenue">Quantité</span>
          {formatQuantite(h.quantite)}
        </div>
        <div>
          <span className="block text-xs text-texte-attenue">Prix actuel</span>
          {formatEuro(md?.prix_actuel ?? null, 2, montantsMasques)}
        </div>
        <div>
          <span className="block text-xs text-texte-attenue">Depuis achat</span>
          <RendementCell value={h.rendement_depuis_achat_pct} />
        </div>
        <div>
          <span className="block text-xs text-texte-attenue">Annualisé</span>
          <RendementCell value={h.rendement_annualise_pct} />
        </div>
        <div>
          <span className="block text-xs text-texte-attenue">Secteur</span>
          {md?.secteur ?? '—'}
        </div>
        <div>
          <span className="block text-xs text-texte-attenue">Pays</span>
          {md?.erreur ? <span className="text-avertissement">{md.erreur}</span> : (md?.pays ?? '—')}
        </div>
      </div>

      <div className="mt-3 flex gap-2 border-t border-bordure pt-3">
        <button
          onClick={(e) => {
            e.stopPropagation()
            onStartEdit(e)
          }}
          className="min-h-11 flex-1 rounded-md border border-bordure text-sm font-medium text-texte"
        >
          Modifier
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation()
            onDelete(e)
          }}
          className="min-h-11 flex-1 rounded-md border border-negatif/40 text-sm font-medium text-negatif"
        >
          Supprimer
        </button>
      </div>
    </div>
  )
}

interface PositionsTableProps {
  /** Lignes déjà filtrées (catégorie + compte) par la page, pas encore triées —
   * le tri est un état purement local à ce tableau. */
  rows: Holding[]
  onSelectTicker: (ticker: string) => void
  onRequestDelete: (h: Holding) => void
  /** Appelé après un `Enregistrer` réussi, pour que la page recharge la liste. */
  onSaved: () => void
}

export default function PositionsTable({ rows, onSelectTicker, onRequestDelete, onSaved }: PositionsTableProps) {
  const { montantsMasques } = usePreferencesAffichage()
  // Table ou cartes (backlog 2.K.4) : rendu conditionnel en JS, pas en CSS pur —
  // cf. la docstring de `useEstMobile` pour pourquoi (contenu répété par ligne).
  const estMobile = useEstMobile()
  const [tri, setTriState] = useState<{ cle: CleTri; direction: SensTri } | null>(() => triStocke())

  function setTri(maj: (prev: { cle: CleTri; direction: SensTri } | null) => { cle: CleTri; direction: SensTri }) {
    setTriState((prev) => {
      const suivant = maj(prev)
      window.sessionStorage.setItem(CLE_TRI, JSON.stringify(suivant))
      return suivant
    })
  }

  // Édition en ligne (LOT 5.8) : une seule ligne éditable à la fois, identifiée par
  // son id. `editForm` reste des chaînes (comme le formulaire d'ajout) pour laisser
  // l'utilisateur taper librement (y compris un champ numérique vidé) sans que
  // `Number('')` (= 0) n'écrase la saisie en cours.
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editForm, setEditForm] = useState<EditForm>({
    quantite: '',
    prix_revient_moyen: '',
    compte: '',
    type_actif: '',
    valeur_estimee: '',
    taux_pct: '',
    date_acquisition: '',
  })
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

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
      valeur_estimee: h.valeur_estimee !== null && h.valeur_estimee !== undefined ? String(h.valeur_estimee) : '',
      taux_pct: h.taux_pct !== null && h.taux_pct !== undefined ? String(h.taux_pct) : '',
      // `<input type="date">` attend AAAA-MM-JJ, l'API renvoie un horodatage complet.
      date_acquisition: h.date_acquisition ? h.date_acquisition.slice(0, 10) : '',
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
        valeur_estimee: editForm.valeur_estimee ? Number(editForm.valeur_estimee) : null,
        taux_pct: editForm.taux_pct ? Number(editForm.taux_pct) : null,
        date_acquisition: editForm.date_acquisition || null,
      })
      setEditingId(null)
      onSaved()
    } catch (err) {
      // L'erreur (400 : quantité négative, etc.) reste affichée SANS quitter le mode
      // édition — l'utilisateur corrige sans avoir à ressaisir le reste du formulaire.
      setEditError((err as Error).message)
    } finally {
      setEditSaving(false)
    }
  }

  function handleDelete(e: React.MouseEvent, h: Holding) {
    e.stopPropagation()
    onRequestDelete(h)
  }

  const lignesAffichees = tri
    ? [...rows].sort((a, b) => {
        const colonne = COLONNES_TRIABLES.find((c) => c.cle === tri.cle)
        if (!colonne) return 0
        return comparerValeurs(colonne.valeur(a), colonne.valeur(b), tri.direction)
      })
    : rows
  const valeurTotaleAffichee = rows.reduce((somme, h) => somme + (h.valeur ?? 0), 0)

  if (estMobile) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <label className="flex flex-1 items-center gap-2 text-xs font-medium text-texte-attenue">
            Trier par
            <select
              value={tri?.cle ?? ''}
              onChange={(e) => {
                const cle = e.target.value as CleTri
                setTri((prev) => ({ cle, direction: prev?.cle === cle ? prev.direction : 'asc' }))
              }}
              className="flex-1 rounded-md border border-bordure bg-surface px-2 py-2 text-sm text-texte"
            >
              <option value="" disabled>
                Choisir...
              </option>
              {COLONNES_TRIABLES.map((col) => (
                <option key={col.cle} value={col.cle}>
                  {col.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => tri && setTri((prev) => ({ cle: prev!.cle, direction: prev!.direction === 'asc' ? 'desc' : 'asc' }))}
            disabled={!tri}
            aria-label={tri?.direction === 'asc' ? 'Tri croissant' : 'Tri décroissant'}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-bordure text-texte disabled:opacity-40"
          >
            {tri?.direction === 'desc' ? '▼' : '▲'}
          </button>
        </div>

        {lignesAffichees.map((h) => (
          <PositionCard
            key={h.id}
            h={h}
            enEdition={editingId === h.id}
            editForm={editForm}
            setEditForm={setEditForm}
            editSaving={editSaving}
            editError={editingId === h.id ? editError : null}
            montantsMasques={montantsMasques}
            onSelect={() => editingId !== h.id && onSelectTicker(h.ticker)}
            onStartEdit={(e) => startEdit(e, h)}
            onCancelEdit={cancelEdit}
            onSaveEdit={(e) => saveEdit(e, h.id)}
            onDelete={(e) => handleDelete(e, h)}
          />
        ))}

        <p className="pt-1 text-sm font-semibold text-texte">
          {rows.length} position{rows.length > 1 ? 's' : ''} · {formatEuro(valeurTotaleAffichee, 2, montantsMasques)}
        </p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-bordure text-left text-xs font-medium uppercase text-texte-attenue">
            {COLONNES_TRIABLES.map((col) => {
              const triActif = tri?.cle === col.cle
              return (
                <th
                  key={col.cle}
                  scope="col"
                  onClick={() => handleSort(col.cle)}
                  aria-sort={triActif ? (tri.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
                  className="cursor-pointer select-none py-2 pr-4 hover:text-texte"
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
        <tbody className="divide-y divide-bordure">
          {lignesAffichees.map((h) => {
            const md = h.market_data
            const enEdition = editingId === h.id
            return (
              <tr
                key={h.id}
                onClick={() => {
                  if (enEdition) return
                  onSelectTicker(h.ticker)
                }}
                className="cursor-pointer hover:bg-surface-elevee"
              >
                <td className="py-2 pr-4 font-medium text-texte">
                  {h.ticker}
                  {h.origine === 'manuel' && (
                    <span
                      title="Ligne saisie manuellement : non recalculée par un import de transactions"
                      className="ml-2 rounded-full bg-surface-elevee px-1.5 py-0.5 text-[10px] font-normal uppercase tracking-wide text-texte-attenue"
                    >
                      saisie manuelle
                    </span>
                  )}
                </td>
                <td className="py-2 pr-4 text-texte">
                  {md?.nom ?? h.nom ?? '—'}
                  {h.date_acquisition && <span className="block text-xs text-texte-attenue">Acquis le {formatDate(h.date_acquisition)}</span>}
                </td>
                <td className="py-2 pr-4">
                  {enEdition ? (
                    <input
                      value={editForm.quantite}
                      onChange={(e) => setEditForm({ ...editForm, quantite: e.target.value })}
                      onClick={(e) => e.stopPropagation()}
                      type="number"
                      step="any"
                      aria-label="Quantité (édition)"
                      className="w-24 rounded-md border border-bordure bg-surface px-2 py-1 text-sm text-texte"
                    />
                  ) : (
                    formatQuantite(h.quantite)
                  )}
                </td>
                <td className="py-2 pr-4">{formatEuro(md?.prix_actuel ?? null, 2, montantsMasques)}</td>
                <td className="py-2 pr-4">{formatEuro(h.valeur, 2, montantsMasques)}</td>
                <td className="py-2 pr-4">
                  <RendementCell value={h.rendement_depuis_achat_pct} />
                </td>
                <td className="py-2 pr-4">
                  <RendementCell value={h.rendement_annualise_pct} />
                </td>
                <td className="py-2 pr-4 text-texte">{md?.secteur ?? '—'}</td>
                <td className="py-2 pr-4 text-texte">
                  {md?.erreur ? <span className="text-avertissement">{md.erreur}</span> : (md?.pays ?? '—')}
                </td>
                <td className="py-2 pr-4 text-right">
                  {enEdition ? (
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={(e) => saveEdit(e, h.id)}
                        disabled={editSaving}
                        className="text-xs font-medium text-positif hover:underline disabled:opacity-40"
                      >
                        Enregistrer
                      </button>
                      <button onClick={(e) => cancelEdit(e)} className="text-xs text-texte-attenue hover:underline">
                        Annuler
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={(e) => startEdit(e, h)} className="text-xs text-texte-attenue hover:underline">
                        Modifier
                      </button>
                      <button onClick={(e) => handleDelete(e, h)} className="text-xs text-negatif hover:underline">
                        Supprimer
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            )
          })}
          {editingId !== null && lignesAffichees.some((h) => h.id === editingId) && (
            <tr onClick={(e) => e.stopPropagation()}>
              <td colSpan={10} className="bg-surface-elevee py-3 pr-4">
                <div className="flex flex-wrap items-end gap-3">
                  <label className="flex flex-col gap-1 text-xs font-medium text-texte-attenue">
                    <span className="inline-flex items-center gap-1">
                      Prix de revient
                      <InfoBulle texte={TEXTE_PRIX_REVIENT} />
                    </span>
                    <input
                      value={editForm.prix_revient_moyen}
                      onChange={(e) => setEditForm({ ...editForm, prix_revient_moyen: e.target.value })}
                      onClick={(e) => e.stopPropagation()}
                      type="number"
                      step="any"
                      aria-label="Prix de revient (édition)"
                      className="w-32 rounded-md border border-bordure bg-surface px-2 py-1.5 text-sm text-texte"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs font-medium text-texte-attenue">
                    Compte
                    <input
                      value={editForm.compte}
                      onChange={(e) => setEditForm({ ...editForm, compte: e.target.value })}
                      onClick={(e) => e.stopPropagation()}
                      aria-label="Compte (édition)"
                      className="w-32 rounded-md border border-bordure bg-surface px-2 py-1.5 text-sm text-texte"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs font-medium text-texte-attenue">
                    Type d'actif
                    <select
                      value={editForm.type_actif}
                      onChange={(e) => setEditForm({ ...editForm, type_actif: e.target.value })}
                      onClick={(e) => e.stopPropagation()}
                      aria-label="Type d'actif (édition)"
                      className="w-36 rounded-md border border-bordure bg-surface px-2 py-1.5 text-sm text-texte"
                    >
                      {TYPE_ACTIF_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1 text-xs font-medium text-texte-attenue">
                    <span className="inline-flex items-center gap-1">
                      Valeur estimée
                      <InfoBulle texte={TEXTE_VALEUR_ESTIMEE} />
                    </span>
                    <input
                      value={editForm.valeur_estimee}
                      onChange={(e) => setEditForm({ ...editForm, valeur_estimee: e.target.value })}
                      onClick={(e) => e.stopPropagation()}
                      type="number"
                      step="any"
                      aria-label="Valeur estimée (édition)"
                      className="w-32 rounded-md border border-bordure bg-surface px-2 py-1.5 text-sm text-texte"
                      placeholder="optionnel"
                    />
                  </label>
                  {TYPES_AVEC_TAUX.has(editForm.type_actif) && (
                    <label className="flex flex-col gap-1 text-xs font-medium text-texte-attenue">
                      {libelleTaux(editForm.type_actif)}
                      <input
                        value={editForm.taux_pct}
                        onChange={(e) => setEditForm({ ...editForm, taux_pct: e.target.value })}
                        onClick={(e) => e.stopPropagation()}
                        type="number"
                        step="any"
                        aria-label="Taux annuel (édition)"
                        className="w-32 rounded-md border border-bordure bg-surface px-2 py-1.5 text-sm text-texte"
                        placeholder={editForm.type_actif === 'VEHICLE' ? '-15' : '3'}
                      />
                    </label>
                  )}
                  {TYPES_PATRIMOINE.has(editForm.type_actif) && (
                    <label className="flex flex-col gap-1 text-xs font-medium text-texte-attenue">
                      Date d'acquisition
                      <input
                        value={editForm.date_acquisition}
                        onChange={(e) => setEditForm({ ...editForm, date_acquisition: e.target.value })}
                        onClick={(e) => e.stopPropagation()}
                        type="date"
                        aria-label="Date d'acquisition (édition)"
                        className="w-36 rounded-md border border-bordure bg-surface px-2 py-1.5 text-sm text-texte"
                      />
                    </label>
                  )}
                </div>
                {TYPES_AVEC_TAUX.has(editForm.type_actif) &&
                  valeurProjeteeUnAn(
                    editForm.valeur_estimee ? Number(editForm.valeur_estimee) : null,
                    editForm.taux_pct ? Number(editForm.taux_pct) : null,
                  ) !== null && (
                    <p className="mt-2 text-xs text-texte-attenue">
                      Valeur projetée dans 1 an (indicatif) :{' '}
                      {valeurProjeteeUnAn(Number(editForm.valeur_estimee), Number(editForm.taux_pct))?.toLocaleString('fr-FR', {
                        style: 'currency',
                        currency: 'EUR',
                        maximumFractionDigits: 0,
                      })}
                    </p>
                  )}
                {editError && <p className="mt-2 text-xs text-negatif">{editError}</p>}
              </td>
            </tr>
          )}
        </tbody>
        <tfoot>
          <tr className="border-t border-bordure text-sm font-semibold text-texte">
            <td colSpan={4} className="py-2 pr-4">
              {rows.length} position{rows.length > 1 ? 's' : ''}
            </td>
            <td className="py-2 pr-4">{formatEuro(valeurTotaleAffichee, 2, montantsMasques)}</td>
            <td colSpan={5}></td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
