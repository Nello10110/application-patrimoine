import { useEffect, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { api } from '../api/client'
import type { Detenteur, Holding, HoldingDetail, ValuationHistoryPoint } from '../api/types'
import Card from './Card'
import EtatVide from './EtatVide'
import HoldingPriceHistoryChart from './HoldingPriceHistoryChart'
import Modale from './Modale'
import PieChartCard from './PieChartCard'
import { usePreferencesAffichage } from '../hooks/usePreferencesAffichage'
import { TYPE_ACTIF_OPTIONS, TYPES_EPARGNE } from '../utils/holdingCategories'
import { formatDate, formatEuro, formatPct, formatQuantite } from '../utils/format'
import { COULEUR_AXE, COULEUR_GRILLE, STYLE_INFOBULLE, STYLE_TICK_AXE } from '../utils/chartTheme'

function libelleTypeActif(typeActif: string | null): string | null {
  if (!typeActif) return null
  return TYPE_ACTIF_OPTIONS.find((o) => o.value === typeActif)?.label ?? typeActif
}

type ModeDecomposition = 'versement' | 'plus_value'

/** Le versement et la plus-value d'un point d'historique sont les deux faces de la
 * même somme (`valeur - valeurPrécédente`, backlog § U.2) : connaître l'une donne
 * l'autre par soustraction. Un seul champ est jamais stocké (`versement`, sur
 * `HoldingValuationHistory`) — cette fonction traduit la saisie de l'utilisateur
 * (quel que soit le champ qu'il a choisi de remplir) vers cette seule donnée. */
function versementDepuisDecomposition(
  mode: ModeDecomposition,
  montant: string,
  valeur: string,
  valeurPrecedente: number | null,
): number | null {
  if (!montant) return null
  if (mode === 'versement') return Number(montant)
  if (valeurPrecedente === null || !valeur) return null
  return Number(valeur) - valeurPrecedente - Number(montant)
}

/** Bascule versement/plus-value (retour utilisateur 30/08/2026, suite § U.2) :
 * selon ce que l'utilisateur connaît réellement (un versement précis relevé sur son
 * compte, ou directement la plus-value affichée par son contrat), il choisit lequel
 * saisir — l'autre est toujours déduit, jamais demandé deux fois. La bascule
 * « Plus-value » est désactivée sans point antérieur connu (rien dont déduire une
 * plus-value) ; le versement reste alors la seule saisie possible, comme avant
 * cette fonctionnalité. */
function ChampDecomposition({
  mode,
  onModeChange,
  montant,
  onMontantChange,
  valeur,
  valeurPrecedente,
  montantsMasques,
  libelleVersement,
  libellePlusValue,
  ariaLabelVersement,
  ariaLabelPlusValue,
}: {
  mode: ModeDecomposition
  onModeChange: (m: ModeDecomposition) => void
  montant: string
  onMontantChange: (v: string) => void
  valeur: string
  valeurPrecedente: number | null
  montantsMasques: boolean
  libelleVersement: string
  libellePlusValue: string
  ariaLabelVersement?: string
  ariaLabelPlusValue?: string
}) {
  const delta = valeurPrecedente !== null && valeur ? Number(valeur) - valeurPrecedente : null
  const autre = delta !== null && montant ? delta - Number(montant) : null

  return (
    <div className="flex flex-col gap-1 text-xs font-medium text-texte-attenue">
      {/* Bascule hors du `<label>` ci-dessous : son texte doit rester exactement le
          libellé du champ (nom accessible de l'input), pas concaténé à "Versement
          Plus-value". */}
      <span className="inline-flex w-fit overflow-hidden rounded border border-bordure text-[11px] normal-case">
        <button
          type="button"
          onClick={() => {
            onModeChange('versement')
            onMontantChange('')
          }}
          aria-pressed={mode === 'versement'}
          className={`px-1.5 py-0.5 ${mode === 'versement' ? 'bg-texte text-surface' : 'text-texte-attenue hover:bg-surface-elevee'}`}
        >
          Versement
        </button>
        <button
          type="button"
          onClick={() => {
            onModeChange('plus_value')
            onMontantChange('')
          }}
          disabled={valeurPrecedente === null}
          aria-pressed={mode === 'plus_value'}
          title={valeurPrecedente === null ? 'Nécessite un point antérieur connu' : undefined}
          className={`border-l border-bordure px-1.5 py-0.5 disabled:cursor-not-allowed disabled:opacity-40 ${
            mode === 'plus_value' ? 'bg-texte text-surface' : 'text-texte-attenue hover:bg-surface-elevee'
          }`}
        >
          Plus-value
        </button>
      </span>
      <label className="flex flex-col gap-1">
        {mode === 'versement' ? libelleVersement : libellePlusValue}
        <input
          value={montant}
          onChange={(e) => onMontantChange(e.target.value)}
          type="number"
          step="any"
          placeholder="optionnel"
          aria-label={mode === 'versement' ? ariaLabelVersement : ariaLabelPlusValue}
          className="w-32 rounded-md border border-bordure bg-surface px-2 py-1.5 text-sm text-texte"
        />
      </label>
      {autre !== null && (
        <span className="font-normal">
          → {mode === 'versement' ? 'plus-value déduite' : 'versement déduit'} : {formatEuro(autre, 2, montantsMasques)}
        </span>
      )}
    </div>
  )
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

const OPTIONS_TYPE_LOCATION = [
  { value: '', label: 'Non renseigné' },
  { value: 'nue', label: 'Location nue' },
  { value: 'meublee', label: 'Location meublée' },
  { value: 'pinel', label: 'Pinel' },
  { value: 'lmnp', label: 'LMNP' },
  { value: 'saisonniere', label: 'Saisonnière' },
]

interface FormImmobilier {
  type_location: string
  loyer_mensuel: string
  charges_mensuelles: string
  frais_annuels: string
  surface_m2: string
  nb_pieces: string
  annee_construction: string
  dpe: string
}

function formulaireDepuis(immo: HoldingDetail['immobilier']): FormImmobilier {
  return {
    type_location: immo?.type_location ?? '',
    loyer_mensuel: immo?.loyer_mensuel !== null && immo?.loyer_mensuel !== undefined ? String(immo.loyer_mensuel) : '',
    charges_mensuelles:
      immo?.charges_mensuelles !== null && immo?.charges_mensuelles !== undefined ? String(immo.charges_mensuelles) : '',
    frais_annuels: immo?.frais_annuels !== null && immo?.frais_annuels !== undefined ? String(immo.frais_annuels) : '',
    surface_m2: immo?.surface_m2 !== null && immo?.surface_m2 !== undefined ? String(immo.surface_m2) : '',
    nb_pieces: immo?.nb_pieces !== null && immo?.nb_pieces !== undefined ? String(immo.nb_pieces) : '',
    annee_construction:
      immo?.annee_construction !== null && immo?.annee_construction !== undefined ? String(immo.annee_construction) : '',
    dpe: immo?.dpe ?? '',
  }
}

/** État + logique de la fiche immobilier (backlog 2.M.3), extrait en hook pour que
 * son affichage puisse être scindé entre deux onglets (backlog 2.M.4) : le
 * formulaire de caractéristiques dans *Paramètres*, le cashflow/rentabilités/
 * historique — calculés côté serveur, jamais recalculés ici — dans *Aperçu*.
 * Toujours appelé (règle des hooks), `chargerHistorique` désactive juste la requête
 * réseau pour toute ligne qui n'est ni `REAL_ESTATE` ni de type Épargne (backlog
 * 2.S.1 — l'historique daté n'est pas réservé à l'immobilier malgré le nom du hook). */
function useImmobilierDetail(ticker: string, chargerHistorique: boolean, immobilierInitial: HoldingDetail['immobilier']) {
  const [immobilier, setImmobilier] = useState(immobilierInitial)
  const [form, setForm] = useState<FormImmobilier>(() => formulaireDepuis(immobilierInitial))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [historique, setHistorique] = useState<ValuationHistoryPoint[]>([])

  const rechargerHistorique = () => {
    api
      .getHoldingValuationHistory(ticker)
      .then(setHistorique)
      .catch(() => setHistorique([]))
  }

  useEffect(() => {
    if (!chargerHistorique) return
    rechargerHistorique()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `ticker` change = remontage du composant parent (route/modale).
  }, [ticker, chargerHistorique])

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      await api.updateHoldingImmobilier(ticker, {
        type_location: form.type_location || null,
        loyer_mensuel: form.loyer_mensuel ? Number(form.loyer_mensuel) : null,
        charges_mensuelles: form.charges_mensuelles ? Number(form.charges_mensuelles) : null,
        frais_annuels: form.frais_annuels ? Number(form.frais_annuels) : null,
        surface_m2: form.surface_m2 ? Number(form.surface_m2) : null,
        nb_pieces: form.nb_pieces ? Number(form.nb_pieces) : null,
        annee_construction: form.annee_construction ? Number(form.annee_construction) : null,
        dpe: form.dpe || null,
      })
      // Cashflow/rentabilité/prix au m² sont calculés côté serveur (jamais recalculés
      // ici) : on relit la fiche complète pour les obtenir à jour, même pattern que
      // `DetenteursSection` après l'enregistrement d'une quotité.
      const detailFrais = await api.getHoldingDetail(ticker)
      setImmobilier(detailFrais.immobilier)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return { immobilier, form, setForm, saving, error, handleSave, historique, rechargerHistorique }
}

/** Onglet *Paramètres* de la fiche immobilier (backlog 2.M.3 + 2.M.4) : formulaire de
 * caractéristiques et location seul — le cashflow/rentabilités/historique calculés
 * vivent désormais dans l'onglet *Aperçu* (`ImmobilierApercu`). */
function ImmobilierParametresForm({
  form,
  setForm,
  saving,
  error,
  onSave,
}: {
  form: FormImmobilier
  setForm: (f: FormImmobilier) => void
  saving: boolean
  error: string | null
  onSave: () => void
}) {
  return (
    <Card title="Immobilier — caractéristiques et location">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs font-medium text-texte-attenue">
          Type de location
          <select
            value={form.type_location}
            onChange={(e) => setForm({ ...form, type_location: e.target.value })}
            className="rounded-md border border-bordure bg-surface px-2 py-1.5 text-sm text-texte"
          >
            {OPTIONS_TYPE_LOCATION.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-texte-attenue">
          Loyer mensuel (€)
          <input
            type="number"
            step="any"
            value={form.loyer_mensuel}
            onChange={(e) => setForm({ ...form, loyer_mensuel: e.target.value })}
            className="rounded-md border border-bordure bg-surface px-2 py-1.5 text-sm text-texte"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-texte-attenue">
          Charges mensuelles (€)
          <input
            type="number"
            step="any"
            value={form.charges_mensuelles}
            onChange={(e) => setForm({ ...form, charges_mensuelles: e.target.value })}
            className="rounded-md border border-bordure bg-surface px-2 py-1.5 text-sm text-texte"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-texte-attenue">
          Frais annuels (taxe foncière, copropriété, assurance, gestion — total)
          <input
            type="number"
            step="any"
            value={form.frais_annuels}
            onChange={(e) => setForm({ ...form, frais_annuels: e.target.value })}
            className="rounded-md border border-bordure bg-surface px-2 py-1.5 text-sm text-texte"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-texte-attenue">
          Surface (m²)
          <input
            type="number"
            step="any"
            value={form.surface_m2}
            onChange={(e) => setForm({ ...form, surface_m2: e.target.value })}
            className="rounded-md border border-bordure bg-surface px-2 py-1.5 text-sm text-texte"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-texte-attenue">
          Nombre de pièces
          <input
            type="number"
            step="1"
            value={form.nb_pieces}
            onChange={(e) => setForm({ ...form, nb_pieces: e.target.value })}
            className="rounded-md border border-bordure bg-surface px-2 py-1.5 text-sm text-texte"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-texte-attenue">
          Année de construction
          <input
            type="number"
            step="1"
            value={form.annee_construction}
            onChange={(e) => setForm({ ...form, annee_construction: e.target.value })}
            className="rounded-md border border-bordure bg-surface px-2 py-1.5 text-sm text-texte"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-texte-attenue">
          DPE
          <input
            value={form.dpe}
            onChange={(e) => setForm({ ...form, dpe: e.target.value })}
            placeholder="A à G"
            maxLength={2}
            className="w-20 rounded-md border border-bordure bg-surface px-2 py-1.5 text-sm text-texte"
          />
        </label>
      </div>

      <button
        onClick={onSave}
        disabled={saving}
        className="mt-4 rounded-md bg-accent px-4 py-2 text-sm font-medium text-surface disabled:opacity-40"
      >
        {saving ? 'Enregistrement...' : 'Enregistrer'}
      </button>
      {error && <p className="mt-2 text-sm text-negatif">{error}</p>}
    </Card>
  )
}

/** Historique daté des valorisations manuelles (backlog 2.M.3, généralisé en 2.S.1
 * à l'écran Épargne) — jamais écrasé, une nouvelle ligne à chaque point saisi.
 * Partagé entre `ImmobilierApercu`, `EpargneApercu` et `EpargnePage`.
 *
 * `dateAcquisition`/`prixRevientMoyen` (backlog § 2.S.3, retour utilisateur
 * 26/08/2026) : quand la date d'acquisition déclarée est antérieure au premier point
 * d'historique connu, un point de départ au coût d'acquisition y est ajouté pour le
 * SEUL graphique (jamais dans le tableau ci-dessous, qui reste le reflet exact des
 * points réellement saisis par l'utilisateur) — même logique d'ancrage que la courbe
 * combinée du Tableau de bord (`patrimoine_history_service._serie_holding_manuel`). */
export function ValorisationHistoriqueCard({
  ticker,
  historique,
  onChanged,
  dateAcquisition = null,
  prixRevientMoyen = null,
}: {
  ticker: string
  historique: ValuationHistoryPoint[]
  onChanged: (holding: Holding) => void
  dateAcquisition?: string | null
  prixRevientMoyen?: number | null
}) {
  const { montantsMasques } = usePreferencesAffichage()
  // Correction/suppression d'un point déjà saisi (backlog quickwin § T.3, retour
  // utilisateur 30/08/2026, capture à l'appui) : jusqu'ici seul l'ajout était
  // possible, une valeur tapée par erreur (ex. 0 €) restait figée pour toujours.
  const [editionId, setEditionId] = useState<number | null>(null)
  const [editValeur, setEditValeur] = useState('')
  const [editDate, setEditDate] = useState('')
  const [editMode, setEditMode] = useState<ModeDecomposition>('versement')
  const [editMontant, setEditMontant] = useState('')
  const [editionSaving, setEditionSaving] = useState(false)
  const [erreurAction, setErreurAction] = useState<string | null>(null)
  const [confirmSuppression, setConfirmSuppression] = useState<ValuationHistoryPoint | null>(null)
  const [suppressionEnCours, setSuppressionEnCours] = useState(false)

  if (historique.length === 0) return null

  function startEdition(p: ValuationHistoryPoint) {
    setErreurAction(null)
    setEditionId(p.id)
    setEditValeur(String(p.valeur))
    setEditDate(p.date_valeur.slice(0, 10))
    // Le versement stocké est toujours ré-affiché en mode « versement », qu'il ait
    // été saisi directement ou déduit d'une plus-value à l'origine — seule cette
    // donnée est connue, jamais laquelle des deux l'utilisateur avait tapée.
    setEditMode('versement')
    setEditMontant(p.versement !== null ? String(p.versement) : '')
  }

  async function saveEdition(pointId: number) {
    if (!editValeur || !editDate) return
    setEditionSaving(true)
    setErreurAction(null)
    const indexEnEdition = historique.findIndex((h) => h.id === pointId)
    const valeurPrecedente = indexEnEdition > 0 ? historique[indexEnEdition - 1].valeur : null
    try {
      const holding = await api.updateHoldingValuationPoint(ticker, pointId, {
        valeur: Number(editValeur),
        date: editDate,
        versement: versementDepuisDecomposition(editMode, editMontant, editValeur, valeurPrecedente),
      })
      setEditionId(null)
      onChanged(holding)
    } catch (err) {
      setErreurAction((err as Error).message)
    } finally {
      setEditionSaving(false)
    }
  }

  async function confirmerSuppression() {
    if (!confirmSuppression) return
    setSuppressionEnCours(true)
    setErreurAction(null)
    try {
      const holding = await api.deleteHoldingValuationPoint(ticker, confirmSuppression.id)
      setConfirmSuppression(null)
      onChanged(holding)
    } catch (err) {
      setErreurAction((err as Error).message)
      setConfirmSuppression(null)
    } finally {
      setSuppressionEnCours(false)
    }
  }

  const pointAcquisition =
    dateAcquisition && prixRevientMoyen !== null && dateAcquisition < historique[0].date_valeur
      ? [{ date_valeur: dateAcquisition, valeur: prixRevientMoyen }]
      : []
  // `historique` est déjà trié chronologiquement par le backend (`immobilier_service.
  // historique_valorisation`, ORDER BY date_valeur) : directement exploitable par le
  // graphique sans retri, une fois le point d'acquisition (le cas échéant) placé en tête.
  const historiqueGraphique = [...pointAcquisition, ...historique]
  const donneesGraphique = historiqueGraphique.map((p) => ({ date: p.date_valeur, Valeur: p.valeur }))

  return (
    <Card title="Historique de valorisation">
      <p className="mb-3 text-xs text-texte-attenue">
        Chaque estimation est datée et conservée — l'ancienne n'est jamais écrasée.
        {pointAcquisition.length > 0 && ' Le premier point (coût d\'acquisition) est ajouté au graphique, pas au tableau ci-dessous.'}
      </p>
      {historiqueGraphique.length > 1 && (
        <ResponsiveContainer width="100%" height={180} className="mb-4">
          <LineChart data={donneesGraphique}>
            <CartesianGrid strokeDasharray="3 3" stroke={COULEUR_GRILLE} />
            <XAxis dataKey="date" tickFormatter={(v) => formatDate(v)} tick={{ fontSize: 11, ...STYLE_TICK_AXE }} stroke={COULEUR_AXE} />
            <YAxis
              tickFormatter={(v) => formatEuro(Number(v), 0, montantsMasques)}
              width={80}
              tick={{ fontSize: 11, ...STYLE_TICK_AXE }}
              stroke={COULEUR_AXE}
            />
            <Tooltip formatter={(v) => formatEuro(Number(v), 2, montantsMasques)} labelFormatter={(v) => formatDate(String(v))} {...STYLE_INFOBULLE} />
            <Line type="monotone" dataKey="Valeur" stroke="#2563eb" strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      )}
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-bordure text-left text-xs font-medium uppercase text-texte-attenue">
            <th className="py-2 pr-4">Date</th>
            <th className="py-2 pr-4 text-right">Valeur estimée</th>
            <th className="py-2 pr-4"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-bordure">
          {[...historique].reverse().map((p) => {
            const indexPoint = historique.findIndex((h) => h.id === p.id)
            const valeurPrecedentePoint = indexPoint > 0 ? historique[indexPoint - 1].valeur : null
            return editionId === p.id ? (
              <tr key={p.id}>
                <td colSpan={3} className="py-2">
                  <div className="flex flex-wrap items-end gap-3">
                    <label className="flex flex-col gap-1 text-xs font-medium text-texte-attenue">
                      Valeur (€)
                      <input
                        value={editValeur}
                        onChange={(e) => setEditValeur(e.target.value)}
                        type="number"
                        step="any"
                        min={0}
                        aria-label={`Valeur du ${formatDate(p.date_valeur)} (édition)`}
                        className="w-32 rounded-md border border-bordure bg-surface px-2 py-1.5 text-sm text-texte"
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-xs font-medium text-texte-attenue">
                      Date
                      <input
                        value={editDate}
                        onChange={(e) => setEditDate(e.target.value)}
                        type="date"
                        aria-label={`Date du ${formatDate(p.date_valeur)} (édition)`}
                        className="rounded-md border border-bordure bg-surface px-2 py-1.5 text-sm text-texte"
                      />
                    </label>
                    <ChampDecomposition
                      mode={editMode}
                      onModeChange={setEditMode}
                      montant={editMontant}
                      onMontantChange={setEditMontant}
                      valeur={editValeur}
                      valeurPrecedente={valeurPrecedentePoint}
                      montantsMasques={montantsMasques}
                      libelleVersement="Dont versement (€)"
                      libellePlusValue="Dont plus-value (€)"
                      ariaLabelVersement={`Versement du ${formatDate(p.date_valeur)} (édition)`}
                      ariaLabelPlusValue={`Plus-value du ${formatDate(p.date_valeur)} (édition)`}
                    />
                    <button
                      onClick={() => saveEdition(p.id)}
                      disabled={editionSaving}
                      className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-surface disabled:opacity-40"
                    >
                      Enregistrer
                    </button>
                    <button
                      onClick={() => setEditionId(null)}
                      className="rounded-md border border-bordure px-3 py-1.5 text-sm font-medium text-texte"
                    >
                      Annuler
                    </button>
                  </div>
                </td>
              </tr>
            ) : (
              <tr key={p.id}>
                <td className="py-2 pr-4 text-texte">{formatDate(p.date_valeur)}</td>
                <td className="py-2 pr-4 text-right">
                  <span className="font-medium text-texte">{formatEuro(p.valeur, 2, montantsMasques)}</span>
                  {p.versement !== null && (
                    <span className="block text-xs text-texte-attenue">
                      dont {formatEuro(p.versement, 2, montantsMasques)} versés
                    </span>
                  )}
                </td>
                <td className="py-2 pr-4 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <button onClick={() => startEdition(p)} className="text-xs text-texte-attenue hover:underline">
                      Modifier
                    </button>
                    <button onClick={() => setConfirmSuppression(p)} className="text-xs text-negatif hover:underline">
                      Supprimer
                    </button>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {erreurAction && <p className="mt-2 text-sm text-negatif">{erreurAction}</p>}

      {confirmSuppression && (
        <Modale onClose={() => setConfirmSuppression(null)} panelClassName="w-full max-w-sm rounded-xl bg-surface p-6 shadow-xl">
          {({ titleId }) => (
            <>
              <h2 id={titleId} className="text-lg font-semibold text-texte">
                Supprimer ce point d'historique ?
              </h2>
              <p className="mt-2 text-sm text-texte">
                Le point du{' '}
                <span className="font-medium text-texte">{formatDate(confirmSuppression.date_valeur)}</span> (
                {formatEuro(confirmSuppression.valeur, 2, montantsMasques)}) sera définitivement supprimé.
              </p>
              <div className="mt-5 flex justify-end gap-2">
                <button
                  onClick={() => setConfirmSuppression(null)}
                  disabled={suppressionEnCours}
                  className="rounded-md px-4 py-2 text-sm font-medium text-texte-attenue hover:bg-surface-elevee disabled:opacity-40"
                >
                  Annuler
                </button>
                <button
                  onClick={confirmerSuppression}
                  disabled={suppressionEnCours}
                  className="rounded-md bg-negatif px-4 py-2 text-sm font-medium text-surface hover:opacity-90 disabled:opacity-40"
                >
                  {suppressionEnCours ? 'Suppression...' : 'Supprimer'}
                </button>
              </div>
            </>
          )}
        </Modale>
      )}
    </Card>
  )
}

/** Formulaire d'ajout rapide d'un point d'historique à une date choisie par
 * l'utilisateur (backlog 2.S.1) — jamais `datetime.now()` imposé côté serveur pour
 * cette route, contrairement à la création/édition classique d'une ligne. Partagé
 * avec `EpargnePage` (action rapide « Ajouter une valorisation » sur chaque compte). */
export function AjoutValorisationForm({
  ticker,
  historique,
  onAdded,
}: {
  ticker: string
  historique: ValuationHistoryPoint[]
  onAdded: (holding: Holding) => void
}) {
  const { montantsMasques } = usePreferencesAffichage()
  const [valeur, setValeur] = useState('')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [mode, setMode] = useState<ModeDecomposition>('versement')
  const [montant, setMontant] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // `historique` est trié chronologiquement (croissant) par le backend : le dernier
  // point est le plus récent, celui dont ce nouveau point marque l'évolution.
  const valeurPrecedente = historique.length > 0 ? historique[historique.length - 1].valeur : null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!valeur) return
    setSaving(true)
    setError(null)
    try {
      const holding = await api.setHoldingValorisation(ticker, {
        valeur: Number(valeur),
        date,
        versement: versementDepuisDecomposition(mode, montant, valeur, valeurPrecedente),
      })
      setValeur('')
      setMontant('')
      onAdded(holding)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1 text-xs font-medium text-texte-attenue">
        Valeur (€)
        <input
          type="number"
          step="any"
          min={0}
          required
          value={valeur}
          onChange={(e) => setValeur(e.target.value)}
          className="w-32 rounded-md border border-bordure bg-surface px-2 py-1.5 text-sm text-texte"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-texte-attenue">
        Date
        <input
          type="date"
          required
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="rounded-md border border-bordure bg-surface px-2 py-1.5 text-sm text-texte"
        />
      </label>
      <ChampDecomposition
        mode={mode}
        onModeChange={setMode}
        montant={montant}
        onMontantChange={setMontant}
        valeur={valeur}
        valeurPrecedente={valeurPrecedente}
        montantsMasques={montantsMasques}
        libelleVersement="Dont versement (€)"
        libellePlusValue="Dont plus-value (€)"
      />
      <button
        type="submit"
        disabled={saving}
        className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-surface disabled:opacity-40"
      >
        {saving ? 'Enregistrement...' : 'Ajouter une valorisation'}
      </button>
      {error && <span className="text-sm text-negatif">{error}</span>}
      <p className="w-full text-xs text-texte-attenue">
        Versement ou plus-value, au choix — l'autre se déduit automatiquement de l'évolution depuis le point précédent. Laisser
        vide si vous ne savez pas : l'écran Rapport continuera d'estimer le gain via le taux déclaré.
      </p>
    </form>
  )
}

/** Onglet *Aperçu* d'un compte Épargne (backlog 2.S.1) : historique daté + versement
 * mensuel déclaré + ajout rapide d'un point — remplace la courbe de cours (sans
 * objet pour un actif non coté) pour les 5 types couverts par `TYPES_EPARGNE`. */
function EpargneApercu({
  detail,
  historique,
  onValorisationAjoutee,
}: {
  detail: HoldingDetail
  historique: ValuationHistoryPoint[]
  onValorisationAjoutee: () => void
}) {
  const { montantsMasques } = usePreferencesAffichage()
  // Copie locale rafraîchie depuis la réponse de `setHoldingValorisation` (qui
  // renvoie le holding à jour) : évite de dépendre d'un rechargement complet de la
  // fiche parente juste pour refléter l'antidatage-safe côté "valeur actuelle".
  const [valeurActuelle, setValeurActuelle] = useState(detail.valeur_estimee)
  const [dateValeurActuelle, setDateValeurActuelle] = useState(detail.date_valeur_estimee)

  function handleValorisationAjoutee(holding: Holding) {
    setValeurActuelle(holding.valeur_estimee)
    setDateValeurActuelle(holding.date_valeur_estimee)
    onValorisationAjoutee()
  }

  return (
    <>
      <Card>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-texte-attenue">Valeur actuelle</p>
            <p className="mt-1 text-lg font-semibold text-texte">{formatEuro(valeurActuelle, 2, montantsMasques)}</p>
            {dateValeurActuelle && <p className="mt-1 text-xs text-texte-attenue">à jour au {formatDate(dateValeurActuelle)}</p>}
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-texte-attenue">Versement mensuel déclaré</p>
            <p className="mt-1 text-lg font-semibold text-texte">
              {detail.versement_mensuel !== null ? formatEuro(detail.versement_mensuel, 2, montantsMasques) : '—'}
            </p>
            <p className="mt-1 text-xs text-texte-attenue">additionné au préremplissage du Simulateur</p>
          </div>
        </div>
      </Card>

      <ValorisationHistoriqueCard
        ticker={detail.ticker}
        historique={historique}
        onChanged={handleValorisationAjoutee}
        dateAcquisition={detail.date_acquisition}
        prixRevientMoyen={detail.prix_revient_moyen}
      />

      <Card title="Ajouter une valorisation">
        <p className="mb-3 text-xs text-texte-attenue">
          Un point antidaté (rattrapage a posteriori) ne remplace jamais la valeur actuelle si une date plus récente est déjà
          connue.
        </p>
        <AjoutValorisationForm ticker={detail.ticker} historique={historique} onAdded={handleValorisationAjoutee} />
      </Card>
    </>
  )
}

/** Onglet *Aperçu* de la fiche immobilier (backlog 2.M.4) : cashflow/rentabilités/
 * prix au m² déjà calculés côté serveur, et l'historique daté des valorisations —
 * jamais écrasé, une nouvelle ligne à chaque changement réel de `valeur_estimee`.
 * Remplace la courbe de cours (sans objet pour un bien non coté). */
function ImmobilierApercu({
  ticker,
  immobilier,
  historique,
  onHistoriqueChanged,
  dateAcquisition,
  prixRevientMoyen,
}: {
  ticker: string
  immobilier: HoldingDetail['immobilier']
  historique: ValuationHistoryPoint[]
  onHistoriqueChanged: (holding: Holding) => void
  dateAcquisition: HoldingDetail['date_acquisition']
  prixRevientMoyen: HoldingDetail['prix_revient_moyen']
}) {
  const { montantsMasques } = usePreferencesAffichage()

  return (
    <>
      {immobilier && (immobilier.cashflow_mensuel !== null || immobilier.prix_m2 !== null) && (
        <Card title="Cashflow et rentabilité">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {immobilier.cashflow_mensuel !== null && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-texte-attenue">Cashflow mensuel</p>
                <p className={`mt-1 text-lg font-semibold ${immobilier.cashflow_mensuel >= 0 ? 'text-positif' : 'text-negatif'}`}>
                  {formatEuro(immobilier.cashflow_mensuel, 2, montantsMasques)}
                </p>
                <p className="mt-1 text-xs text-texte-attenue">loyer − charges − frais/12 − mensualité</p>
              </div>
            )}
            {immobilier.rentabilite_brute_pct !== null && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-texte-attenue">Rentabilité brute</p>
                <p className="mt-1 text-lg font-semibold text-texte">{formatPct(immobilier.rentabilite_brute_pct)}</p>
                <p className="mt-1 text-xs text-texte-attenue">loyer annuel / prix d'acquisition</p>
              </div>
            )}
            {immobilier.rentabilite_nette_pct !== null && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-texte-attenue">Rentabilité nette</p>
                <p className="mt-1 text-lg font-semibold text-texte">{formatPct(immobilier.rentabilite_nette_pct)}</p>
                <p className="mt-1 text-xs text-texte-attenue">(loyer − charges − frais) / prix d'acquisition</p>
              </div>
            )}
            {immobilier.prix_m2 !== null && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-texte-attenue">Prix au m²</p>
                <p className="mt-1 text-lg font-semibold text-texte">{formatEuro(immobilier.prix_m2, 2, montantsMasques)}</p>
              </div>
            )}
            {immobilier.emprunt_mensualite !== null && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-texte-attenue">Mensualité de l'emprunt rattaché</p>
                <p className="mt-1 text-lg font-semibold text-texte">{formatEuro(immobilier.emprunt_mensualite, 2, montantsMasques)}</p>
              </div>
            )}
          </div>
        </Card>
      )}

      <ValorisationHistoriqueCard
        ticker={ticker}
        historique={historique}
        onChanged={onHistoriqueChanged}
        dateAcquisition={dateAcquisition}
        prixRevientMoyen={prixRevientMoyen}
      />
    </>
  )
}

type Onglet = 'apercu' | 'analyse' | 'parametres'

const ONGLETS: { key: Onglet; label: string }[] = [
  { key: 'apercu', label: 'Aperçu' },
  { key: 'analyse', label: 'Analyse' },
  { key: 'parametres', label: 'Paramètres' },
]

/** Fiche d'actif unifiée (backlog 2.M.4) : toute ligne du patrimoine — quelle que
 * soit sa nature (boursière, immobilière, épargne, véhicule...) — ouvre la même
 * structure à trois onglets. *Aperçu* : valeur, courbe/indicateurs propres à la
 * nature de l'actif, informations émetteur. *Analyse* : exposition géo/sectorielle,
 * détention et part nette. *Paramètres* : édition sectionnée (aujourd'hui, les
 * caractéristiques immobilières — seul formulaire de réglages existant ; les autres
 * natures affichent un état vide explicite plutôt qu'un onglet qui semblerait cassé). */
export default function HoldingDetailContent({ detail, titleId }: { detail: HoldingDetail; titleId?: string }) {
  const { montantsMasques } = usePreferencesAffichage()
  const gainPositif = (detail.rendement_depuis_achat_pct ?? 0) >= 0
  const estImmobilier = detail.type_actif === 'REAL_ESTATE'
  const estEpargne = detail.type_actif !== null && TYPES_EPARGNE.has(detail.type_actif)
  const immo = useImmobilierDetail(detail.ticker, estImmobilier || estEpargne, detail.immobilier)
  const [onglet, setOnglet] = useState<Onglet>('apercu')

  return (
    <div className="space-y-6">
      <div className="flex items-baseline gap-3">
        <h2 id={titleId} className="text-xl font-semibold text-texte">
          {detail.nom ?? detail.ticker}
        </h2>
        <span className="text-sm text-texte-attenue">{detail.ticker}</span>
        {detail.type_actif && (
          <span className="rounded-full bg-surface-elevee px-2 py-0.5 text-xs font-medium text-texte-attenue">
            {libelleTypeActif(detail.type_actif)}
          </span>
        )}
      </div>

      <div role="tablist" aria-label="Sections de la fiche" className="flex gap-1 border-b border-bordure">
        {ONGLETS.map((o) => (
          <button
            key={o.key}
            type="button"
            role="tab"
            id={`fiche-onglet-${o.key}`}
            aria-selected={onglet === o.key}
            aria-controls={`fiche-panneau-${o.key}`}
            onClick={() => setOnglet(o.key)}
            className={`-mb-px rounded-t-md border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              onglet === o.key
                ? 'border-texte text-texte'
                : 'border-transparent text-texte-attenue hover:text-texte'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>

      {onglet === 'apercu' && (
        <div id="fiche-panneau-apercu" role="tabpanel" aria-labelledby="fiche-onglet-apercu" className="space-y-6">
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

          {estImmobilier ? (
            <ImmobilierApercu
              ticker={detail.ticker}
              immobilier={immo.immobilier}
              historique={immo.historique}
              onHistoriqueChanged={() => immo.rechargerHistorique()}
              dateAcquisition={detail.date_acquisition}
              prixRevientMoyen={detail.prix_revient_moyen}
            />
          ) : estEpargne ? (
            <EpargneApercu detail={detail} historique={immo.historique} onValorisationAjoutee={immo.rechargerHistorique} />
          ) : (
            <HoldingPriceHistoryChart ticker={detail.ticker} />
          )}

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
        </div>
      )}

      {onglet === 'analyse' && (
        <div id="fiche-panneau-analyse" role="tabpanel" aria-labelledby="fiche-onglet-analyse" className="space-y-6">
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

          <DetenteursSection ticker={detail.ticker} quotitesInitiales={detail.quotites} />
        </div>
      )}

      {onglet === 'parametres' && (
        <div id="fiche-panneau-parametres" role="tabpanel" aria-labelledby="fiche-onglet-parametres" className="space-y-6">
          {estImmobilier ? (
            <ImmobilierParametresForm
              form={immo.form}
              setForm={immo.setForm}
              saving={immo.saving}
              error={immo.error}
              onSave={immo.handleSave}
            />
          ) : (
            <Card>
              <EtatVide titre="Aucun paramètre modifiable pour cette ligne pour l'instant." />
            </Card>
          )}
        </div>
      )}
    </div>
  )
}
