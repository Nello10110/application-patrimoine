import { useState } from 'react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { api } from '../api/client'
import type { Holding, ValuationHistoryPoint } from '../api/types'
import Card from './Card'
import ChampDecomposition from './ChampDecomposition'
import Modale from './Modale'
import { usePreferencesAffichage } from '../hooks/usePreferencesAffichage'
import type { ModeDecomposition } from '../utils/valorisationDecomposition'
import { versementDepuisDecomposition } from '../utils/valorisationDecomposition'
import { formatDate, formatEuro } from '../utils/format'
import { COULEUR_AXE, COULEUR_GRILLE, STYLE_INFOBULLE, STYLE_TICK_AXE } from '../utils/chartTheme'

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
            <th className="py-2 pr-4">
              <span className="sr-only">Actions</span>
            </th>
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
