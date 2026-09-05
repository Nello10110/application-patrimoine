import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import type { CleCompte, TransactionImportApercu, TransactionImportResult } from '../api/types'
import Card from './Card'
import Dropzone from './Dropzone'
import { IconFlecheDroite } from './icons'
import SelecteurEtablissement, { NOUVEAU_ETABLISSEMENT } from './SelecteurEtablissement'

// Ordre d'affichage des clés de compte à l'écran d'aperçu — même ordre que
// `transaction_import.CLES_COMPTE` côté backend.
const ORDRE_CLES: CleCompte[] = ['pea', 'compte_titres', 'crypto', 'obligations']

/** Import d'un historique de transactions complet (format Trade Republic, détecté
 * automatiquement côté backend) — extrait de `ImportPage.tsx` (2026-09-01) pour être
 * réutilisable ailleurs, d'abord dans l'assistant de bienvenue
 * (`onboarding/EtapeDemarragePortefeuille.tsx`).
 *
 * Réécrit en DEUX TEMPS le 03/09/2026 (demande directe de l'utilisateur : « il faut
 * qu'à l'import il me demande et remplisse l'établissement, et [...] j'ai une partie
 * PEA, une partie Compte titre, une partie Cryptomonnaie et une partie obligation »)
 * — même patron que le relevé de positions (`ImportPage.tsx::handleFileChange`/
 * `handleConfirm`) : un aperçu (`api.importTransactionsApercu`) qui compte les
 * lignes par bucket de compte suggéré et propose un nom éditable pour chacun,
 * suivi d'une confirmation qui crée les comptes (sous l'établissement choisi) et
 * importe.
 *
 * `onImported` (optionnel) : callback après import réussi, EN PLUS du bandeau de
 * résultat affiché ici — l'appelant décide s'il a besoin de réagir (ex. recharger un
 * compteur de positions affiché ailleurs). Absent sur `ImportPage.tsx`, qui n'en a pas
 * besoin (le bandeau de résultat lui suffit). */
export default function ImportTransactionsSection({ onImported }: { onImported?: (resultat: TransactionImportResult) => void }) {
  const navigate = useNavigate()
  const txInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<TransactionImportResult | null>(null)

  const [apercu, setApercu] = useState<TransactionImportApercu | null>(null)
  const [etablissementId, setEtablissementId] = useState('')
  const [etablissementNom, setEtablissementNom] = useState('')
  const [etablissementLogoKey, setEtablissementLogoKey] = useState<string | null>(null)
  const [nomsComptes, setNomsComptes] = useState<Partial<Record<CleCompte, string>>>({})

  async function handleFileChange(file: File) {
    setError(null)
    setResult(null)
    setUploading(true)
    try {
      const a = await api.importTransactionsApercu(file)
      setApercu(a)
      setEtablissementId('')
      setEtablissementNom('')
      setEtablissementLogoKey(null)
      setNomsComptes({})
    } catch (err) {
      setError((err as Error).message)
      if (txInputRef.current) txInputRef.current.value = ''
    } finally {
      setUploading(false)
    }
  }

  const etablissementValide =
    etablissementId === NOUVEAU_ETABLISSEMENT ? etablissementNom.trim() !== '' : etablissementId !== ''

  async function handleConfirm() {
    if (!apercu || !etablissementValide) return
    setConfirming(true)
    setError(null)
    try {
      const nouvelEtablissement = etablissementId === NOUVEAU_ETABLISSEMENT
      const res = await api.importTransactionsConfirm({
        file_token: apercu.file_token,
        etablissement_id: !nouvelEtablissement ? Number(etablissementId) : null,
        etablissement_nom: nouvelEtablissement ? etablissementNom.trim() || null : null,
        etablissement_logo_key: nouvelEtablissement ? etablissementLogoKey : null,
        noms_comptes: nomsComptes,
      })
      setResult(res)
      setApercu(null)
      if (txInputRef.current) txInputRef.current.value = ''
      onImported?.(res)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setConfirming(false)
    }
  }

  const clesPresentes = apercu ? ORDRE_CLES.filter((cle) => (apercu.comptages[cle] ?? 0) > 0) : []

  return (
    <Card>
      <h3 className="mb-1 text-sm font-semibold text-texte">
        Historique de transactions (format détecté automatiquement)
      </h3>
      <p className="mb-3 text-sm text-texte">
        Pour un export complet de type Trade Republic (achats, ventes, dividendes...). Le portefeuille réel est entièrement
        recalculé à partir de cet historique (coût de revient inclus). Seule l'activité boursière est conservée : les
        mouvements de carte bancaire et les virements avec la banque (dépôts/retraits) sont automatiquement exclus.
        Chaque ligne est rattachée au compte adapté (PEA, Compte-titres, Cryptomonnaie, Obligations) sous
        l'établissement que vous choisissez à l'étape suivante.
      </p>
      <Dropzone
        ref={txInputRef}
        accept=".csv"
        hint="Fichier CSV, format Trade Republic"
        uploading={uploading}
        onFileSelected={handleFileChange}
        ariaLabel="Historique de transactions"
      />
      {error && <p className="mt-2 text-sm text-negatif">{error}</p>}

      {apercu && (
        <div className="mt-4 space-y-4 border-t border-bordure pt-4">
          <p className="text-sm text-texte">
            {apercu.lignes_lues} ligne(s) lue(s), {apercu.mouvements_hors_bourse_exclus} mouvement(s) hors suivi boursier
            exclu(s).
          </p>

          <label className="flex flex-col gap-1 text-xs font-medium text-texte-attenue sm:w-64">
            Établissement *
            <SelecteurEtablissement
              etablissements={apercu.etablissements}
              value={etablissementId}
              nomNouveau={etablissementNom}
              onValueChange={setEtablissementId}
              onNomNouveauChange={setEtablissementNom}
              logoKeyNouveau={etablissementLogoKey}
              onLogoKeyNouveauChange={setEtablissementLogoKey}
              required
              ariaLabel="Établissement"
              className="rounded-md border border-bordure bg-surface px-2 py-1.5 text-sm text-texte"
            />
          </label>

          {clesPresentes.length > 0 && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {clesPresentes.map((cle) => (
                <label key={cle} className="flex flex-col gap-1 text-xs font-medium text-texte-attenue">
                  {apercu.noms_par_defaut[cle]} ({apercu.comptages[cle]} ligne{(apercu.comptages[cle] ?? 0) > 1 ? 's' : ''})
                  <input
                    value={nomsComptes[cle] ?? apercu.noms_par_defaut[cle]}
                    onChange={(e) => setNomsComptes({ ...nomsComptes, [cle]: e.target.value })}
                    className="rounded-md border border-bordure bg-surface px-2 py-1.5 text-sm text-texte"
                  />
                </label>
              ))}
            </div>
          )}

          <button
            onClick={handleConfirm}
            disabled={!etablissementValide || confirming}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-surface disabled:opacity-40"
          >
            {confirming ? 'Import en cours...' : "Confirmer l'import"}
          </button>
        </div>
      )}

      {/* Bandeaux à fond teinté (succès/avertissement) : même exception que
          `QualiteDonneesCard` (backlog 2.K.1) — hors des 9 jetons sémantiques. */}
      {result && (
        <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-400/30 dark:bg-emerald-950/40 dark:text-emerald-200">
          <p>
            {result.importees} transaction(s) importée(s){result.doublons_ignores > 0 && `, ${result.doublons_ignores} déjà présente(s)`}
            , {result.mouvements_hors_bourse_exclus} mouvement(s) hors suivi boursier exclu(s).
          </p>
          <p className="mt-1">
            {result.positions_recalculees} position(s) recalculée(s) dans le portefeuille
            {result.comptes_crees > 0 && `, ${result.comptes_crees} compte(s) créé(s)`}.
          </p>
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
