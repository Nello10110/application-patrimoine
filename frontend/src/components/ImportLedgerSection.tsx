import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import type { LedgerImportApercu, LedgerImportResult } from '../api/types'
import Card from './Card'
import { PrimaryButton } from './Controls'
import Dropzone from './Dropzone'
import { Field, Input } from './Field'
import { IconFlecheDroite } from './icons'
import SelecteurEtablissement, { NOUVEAU_ETABLISSEMENT } from './SelecteurEtablissement'
import { formatEuro } from '../utils/format'

/** Import d'un export de wallet matériel Ledger (retour utilisateur du 11/09/2026),
 * carte SÉPARÉE de l'historique de transactions Trade Republic
 * (`ImportTransactionsSection.tsx`) — formats et courtiers totalement différents,
 * même patron en deux temps (aperçu puis confirmation) que ce dernier.
 *
 * Particularité de ce format : un même fichier mélange plusieurs cryptos (une
 * ligne par opération, sur n'importe quelle devise), et un wallet matériel
 * accumule souvent des jetons spam/poussière reçus sans action de l'utilisateur —
 * l'aperçu propose donc une case à cocher par devise détectée plutôt qu'un unique
 * bouton de confirmation, pour les exclure avant import. */
export default function ImportLedgerSection() {
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<LedgerImportResult | null>(null)

  const [apercu, setApercu] = useState<LedgerImportApercu | null>(null)
  const [etablissementId, setEtablissementId] = useState('')
  const [etablissementNom, setEtablissementNom] = useState('')
  const [etablissementLogoKey, setEtablissementLogoKey] = useState<string | null>(null)
  const [nomCompte, setNomCompte] = useState('Ledger')
  const [devisesDecochees, setDevisesDecochees] = useState<Set<string>>(new Set())

  async function handleFileChange(file: File) {
    setError(null)
    setResult(null)
    setUploading(true)
    try {
      const a = await api.importLedgerApercu(file)
      setApercu(a)
      setEtablissementId('')
      setEtablissementNom('')
      setEtablissementLogoKey(null)
      setNomCompte('Ledger')
      setDevisesDecochees(new Set())
    } catch (err) {
      setError((err as Error).message)
      if (inputRef.current) inputRef.current.value = ''
    } finally {
      setUploading(false)
    }
  }

  function toggleDevise(ticker: string) {
    setDevisesDecochees((precedent) => {
      const suivant = new Set(precedent)
      if (suivant.has(ticker)) suivant.delete(ticker)
      else suivant.add(ticker)
      return suivant
    })
  }

  const devisesSelectionnees = apercu ? apercu.devises.map((d) => d.ticker).filter((t) => !devisesDecochees.has(t)) : []
  const etablissementValide = etablissementId === NOUVEAU_ETABLISSEMENT ? etablissementNom.trim() !== '' : etablissementId !== ''
  const confirmationValide = etablissementValide && nomCompte.trim() !== '' && devisesSelectionnees.length > 0

  async function handleConfirm() {
    if (!apercu || !confirmationValide) return
    setConfirming(true)
    setError(null)
    try {
      const nouvelEtablissement = etablissementId === NOUVEAU_ETABLISSEMENT
      const res = await api.importLedgerConfirm({
        file_token: apercu.file_token,
        etablissement_id: !nouvelEtablissement ? Number(etablissementId) : null,
        etablissement_nom: nouvelEtablissement ? etablissementNom.trim() || null : null,
        etablissement_logo_key: nouvelEtablissement ? etablissementLogoKey : null,
        nom_compte: nomCompte.trim(),
        devises_selectionnees: devisesSelectionnees,
      })
      setResult(res)
      setApercu(null)
      if (inputRef.current) inputRef.current.value = ''
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setConfirming(false)
    }
  }

  return (
    <Card>
      <h3 className="mb-1 text-sm font-semibold text-texte">Wallet crypto (export Ledger)</h3>
      <p className="mb-3 text-sm text-texte">
        Pour un export d'opérations Ledger (Bitcoin, Ethereum, Solana...). Chaque réception est traitée comme un achat au
        prix du jour de réception — utile si vous achetez directement sur le wallet, à ajuster manuellement si vous avez
        transféré des cryptos déjà achetées ailleurs. Les frais réseau ne sont pas comptés (pas de contrepartie en euros
        fiable dans le fichier).
      </p>
      <Dropzone
        ref={inputRef}
        accept=".csv"
        hint="Fichier CSV, export Ledger Live"
        uploading={uploading}
        onFileSelected={handleFileChange}
        ariaLabel="Wallet crypto Ledger"
      />
      {error && <p className="mt-2 text-sm text-negatif">{error}</p>}

      {apercu && (
        <div className="mt-4 space-y-4 border-t border-bordure pt-4">
          <p className="text-sm text-texte">
            {apercu.lignes_lues} ligne(s) lue(s)
            {apercu.lignes_ignorees_statut > 0 && `, ${apercu.lignes_ignorees_statut} non confirmée(s) ignorée(s)`}
            {Object.values(apercu.lignes_ignorees_type_operation).reduce((a, b) => a + b, 0) > 0 &&
              `, ${Object.values(apercu.lignes_ignorees_type_operation).reduce((a, b) => a + b, 0)} opération(s) hors achat/vente ignorée(s)`}
            .
          </p>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Établissement *">
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
              />
            </Field>
            <Field label="Nom du compte">
              <Input value={nomCompte} onChange={(e) => setNomCompte(e.target.value)} />
            </Field>
          </div>

          <fieldset>
            <legend className="mb-2 text-xs font-medium uppercase tracking-wide text-texte-attenue">
              Devises à importer ({apercu.devises.length})
            </legend>
            <div className="space-y-1.5">
              {apercu.devises.map((d) => (
                <label key={d.ticker} className="flex items-center gap-2 text-sm text-texte">
                  <input
                    type="checkbox"
                    checked={!devisesDecochees.has(d.ticker)}
                    onChange={() => toggleDevise(d.ticker)}
                  />
                  <span className="font-medium">{d.ticker}</span>
                  <span className="text-texte-attenue">
                    — {d.nb_operations} opération{d.nb_operations > 1 ? 's' : ''}, {formatEuro(d.montant_total_eur, 2, false)}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <PrimaryButton onClick={handleConfirm} disabled={!confirmationValide || confirming}>
            {confirming ? 'Import en cours...' : "Confirmer l'import"}
          </PrimaryButton>
        </div>
      )}

      {result && (
        <div className="mt-3 rounded-control border border-transparent bg-pos-bg p-3 text-sm text-pos">
          <p>
            {result.importees} opération(s) importée(s)
            {result.mises_a_jour > 0 && `, ${result.mises_a_jour} mise(s) à jour`}
            {result.doublons_ignores > 0 && `, ${result.doublons_ignores} déjà présente(s) et inchangée(s)`}
            {result.lignes_ignorees > 0 && `, ${result.lignes_ignorees} ligne(s) hors achat/vente ignorée(s)`}.
          </p>
          <p className="mt-1">
            {result.positions_recalculees} position(s) recalculée(s) dans le portefeuille
            {result.comptes_crees > 0 && `, ${result.comptes_crees} compte(s) créé(s)`}.
          </p>
          {result.anomalies_detectees > 0 && (
            <p className="mt-1 text-avertissement">
              {result.anomalies_detectees} anomalie(s) détectée(s) (vente supérieure à la quantité détenue) —
              position(s) bornée(s) à 0, voir les journaux serveur.
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
