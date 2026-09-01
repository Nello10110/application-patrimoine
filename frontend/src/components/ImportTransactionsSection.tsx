import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import type { TransactionImportResult } from '../api/types'
import Card from './Card'
import { IconFlecheDroite } from './icons'

/** Import d'un historique de transactions complet (format Trade Republic, détecté
 * automatiquement côté backend) — extrait de `ImportPage.tsx` (2026-09-01) pour être
 * réutilisable ailleurs, d'abord dans l'assistant de bienvenue
 * (`onboarding/EtapeDemarragePortefeuille.tsx`). Comportement strictement inchangé.
 *
 * `onImported` (optionnel) : callback après import réussi, EN PLUS du bandeau de
 * résultat affiché ici — l'appelant décide s'il a besoin de réagir (ex. recharger un
 * compteur de positions affiché ailleurs). Absent sur `ImportPage.tsx`, qui n'en a pas
 * besoin (le bandeau de résultat lui suffit). */
export default function ImportTransactionsSection({ onImported }: { onImported?: (resultat: TransactionImportResult) => void }) {
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
      onImported?.(res)
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
