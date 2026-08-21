import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import type { ImportPreview, ImportResult, TransactionImportResult } from '../api/types'
import Card from '../components/Card'
import { IconFlecheDroite } from '../components/icons'

function TransactionImportSection() {
  const navigate = useNavigate()
  const txInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<TransactionImportResult | null>(null)

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    setResult(null)
    setUploading(true)
    try {
      const res = await api.importTransactions(file)
      setResult(res)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setUploading(false)
      if (txInputRef.current) txInputRef.current.value = ''
    }
  }

  return (
    <Card>
      <h3 className="mb-1 text-sm font-semibold text-texte">
        Historique de transactions (format détecté automatiquement)
      </h3>
      <p className="mb-3 text-sm text-texte">
        Pour un export complet de type Trade Republic (achats, ventes, dividendes...). Le portefeuille réel est entièrement
        recalculé à partir de cet historique (coût de revient inclus). Seule l'activité boursière est conservée : les
        mouvements de carte bancaire et les virements avec la banque (dépôts/retraits) sont automatiquement exclus.
      </p>
      <input ref={txInputRef} type="file" accept=".csv" onChange={handleFileChange} className="text-sm text-texte" />
      {uploading && (
        <p className="mt-2 text-sm text-texte-attenue">Import et recalcul en cours (peut prendre quelques instants)...</p>
      )}
      {error && <p className="mt-2 text-sm text-negatif">{error}</p>}
      {/* Bandeaux à fond teinté (succès/avertissement) : même exception que
          `QualiteDonneesCard` (backlog 2.K.1) — hors des 9 jetons sémantiques. */}
      {result && (
        <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-400/30 dark:bg-emerald-950/40 dark:text-emerald-200">
          <p>
            {result.importees} transaction(s) importée(s){result.doublons_ignores > 0 && `, ${result.doublons_ignores} déjà présente(s)`}
            , {result.mouvements_hors_bourse_exclus} mouvement(s) hors suivi boursier exclu(s).
          </p>
          <p className="mt-1">{result.positions_recalculees} position(s) recalculée(s) dans le portefeuille.</p>
          {result.anomalies_detectees > 0 && (
            <p className="mt-1 text-amber-700 dark:text-amber-400">
              {result.anomalies_detectees} anomalie(s) détectée(s) (vente supérieure à la quantité détenue) —
              position(s) bornée(s) à 0, voir les journaux serveur.
            </p>
          )}
          {result.lignes_manuelles_remplacees > 0 && (
            <p className="mt-1 text-amber-700 dark:text-amber-400">
              {result.lignes_manuelles_remplacees} ligne(s) saisie(s) manuellement remplacée(s) par la position
              recalculée depuis le grand livre (même ticker) — le grand livre fait foi.
            </p>
          )}
          <button onClick={() => navigate('/')} className="mt-2 inline-flex items-center gap-1 font-medium underline">
            Voir le tableau de bord <IconFlecheDroite className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </Card>
  )
}

const OPTIONAL_FIELDS: { key: 'nom_col' | 'compte_col' | 'devise_col'; label: string }[] = [
  { key: 'nom_col', label: 'Nom (optionnel)' },
  { key: 'compte_col', label: 'Compte (optionnel)' },
  { key: 'devise_col', label: 'Devise (optionnel)' },
]

export default function ImportPage() {
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)

  const [tickerCol, setTickerCol] = useState('')
  const [quantiteCol, setQuantiteCol] = useState('')
  const [prixRevientCol, setPrixRevientCol] = useState('')
  const [optionalCols, setOptionalCols] = useState<Record<string, string>>({})
  const [replaceExisting, setReplaceExisting] = useState(false)

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    setResult(null)
    setUploading(true)
    try {
      const preview = await api.importPreview(file)
      setPreview(preview)
      setTickerCol('')
      setQuantiteCol('')
      setPrixRevientCol('')
      setOptionalCols({})
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setUploading(false)
    }
  }

  async function handleConfirm() {
    if (!preview || !tickerCol || !quantiteCol) return
    setConfirming(true)
    setError(null)
    try {
      const res = await api.importConfirm({
        file_token: preview.file_token,
        ticker_col: tickerCol,
        quantite_col: quantiteCol,
        prix_revient_col: prixRevientCol || null,
        nom_col: optionalCols.nom_col || null,
        compte_col: optionalCols.compte_col || null,
        devise_col: optionalCols.devise_col || null,
        replace_existing: replaceExisting,
      })
      setResult(res)
      setPreview(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setConfirming(false)
    }
  }

  const canConfirm = Boolean(preview && tickerCol && quantiteCol)

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-texte">Importer le portefeuille</h2>

      <TransactionImportSection />

      <div className="flex items-center gap-3 text-xs font-medium uppercase tracking-wide text-texte-attenue">
        <div className="h-px flex-1 bg-bordure" />
        ou relevé de positions
        <div className="h-px flex-1 bg-bordure" />
      </div>

      <Card>
        <p className="mb-3 text-sm text-texte">
          Exporte ton portefeuille depuis ton courtier au format CSV ou Excel, puis importe-le ici. Tu associeras ensuite les
          colonnes du fichier aux champs attendus.
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.xlsx,.xls"
          onChange={handleFileChange}
          className="text-sm text-texte"
        />
        {uploading && <p className="mt-2 text-sm text-texte-attenue">Lecture du fichier...</p>}
      </Card>

      {error && <p className="text-sm text-negatif">{error}</p>}

      {result && (
        <Card
          className={
            result.errors.length > 0
              ? 'border-amber-200 bg-amber-50 dark:border-amber-400/30 dark:bg-amber-950/40'
              : 'border-emerald-200 bg-emerald-50 dark:border-emerald-400/30 dark:bg-emerald-950/40'
          }
        >
          <p className="text-sm font-medium text-texte">
            {result.imported} ligne(s) importée(s), {result.skipped} ignorée(s).
          </p>
          {result.errors.length > 0 && (
            <ul className="mt-2 list-disc pl-5 text-xs text-amber-700 dark:text-amber-400">
              {result.errors.slice(0, 10).map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          )}
          <button
            onClick={() => navigate('/patrimoine')}
            className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-accent hover:underline"
          >
            Voir le patrimoine <IconFlecheDroite className="h-3.5 w-3.5" />
          </button>
        </Card>
      )}

      {preview && (
        <Card title={`Aperçu (${preview.total_rows} lignes au total)`}>
          <div className="mb-4 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-bordure text-left text-texte-attenue">
                  {preview.columns.map((c) => (
                    <th key={c} className="py-1.5 pr-4 font-medium">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.rows.slice(0, 5).map((row, i) => (
                  <tr key={i} className="border-b border-bordure">
                    {preview.columns.map((c) => (
                      <td key={c} className="py-1.5 pr-4 text-texte">
                        {row[c]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs font-medium text-texte-attenue">
              Colonne Ticker *
              <select
                value={tickerCol}
                onChange={(e) => setTickerCol(e.target.value)}
                className="rounded-md border border-bordure bg-surface px-2 py-1.5 text-sm text-texte"
              >
                <option value="">— Choisir —</option>
                {preview.columns.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1 text-xs font-medium text-texte-attenue">
              Colonne Quantité *
              <select
                value={quantiteCol}
                onChange={(e) => setQuantiteCol(e.target.value)}
                className="rounded-md border border-bordure bg-surface px-2 py-1.5 text-sm text-texte"
              >
                <option value="">— Choisir —</option>
                {preview.columns.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1 text-xs font-medium text-texte-attenue">
              Colonne Prix de revient (optionnel)
              <select
                value={prixRevientCol}
                onChange={(e) => setPrixRevientCol(e.target.value)}
                className="rounded-md border border-bordure bg-surface px-2 py-1.5 text-sm text-texte"
              >
                <option value="">— Aucune —</option>
                {preview.columns.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>

            {OPTIONAL_FIELDS.map((field) => (
              <label key={field.key} className="flex flex-col gap-1 text-xs font-medium text-texte-attenue">
                {field.label}
                <select
                  value={optionalCols[field.key] ?? ''}
                  onChange={(e) => setOptionalCols({ ...optionalCols, [field.key]: e.target.value })}
                  className="rounded-md border border-bordure bg-surface px-2 py-1.5 text-sm text-texte"
                >
                  <option value="">— Aucune —</option>
                  {preview.columns.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>

          <label className="mt-4 flex items-center gap-2 text-sm text-texte">
            <input type="checkbox" checked={replaceExisting} onChange={(e) => setReplaceExisting(e.target.checked)} />
            Remplacer les lignes déjà saisies ou importées manuellement (les positions issues du grand livre de transactions ne sont pas touchées)
          </label>

          <button
            onClick={handleConfirm}
            disabled={!canConfirm || confirming}
            className="mt-4 rounded-md bg-accent px-4 py-2 text-sm font-medium text-surface disabled:opacity-40"
          >
            {confirming ? 'Import en cours...' : "Confirmer l'import"}
          </button>
        </Card>
      )}
    </div>
  )
}
