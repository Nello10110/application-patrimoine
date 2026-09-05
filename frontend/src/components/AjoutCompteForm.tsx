import { useState } from 'react'
import { api } from '../api/client'
import type { Etablissement } from '../api/types'
import { TYPE_ACTIF_OPTIONS, TYPES_EPARGNE } from '../utils/holdingCategories'
import EtatErreur from './EtatErreur'
import InfoBulle from './InfoBulle'
import SelecteurEtablissement, { NOUVEAU_ETABLISSEMENT } from './SelecteurEtablissement'

const AIDE_NOM_COMPTE =
  "Le nom que VOUS lui donnez, pas un numéro de compte : « PEA Boursorama », « Livret A », « Appartement Lyon ». C'est ce nom qui apparaîtra partout dans l'application."
const AIDE_ETABLISSEMENT =
  "La banque ou le courtier qui héberge ce compte (revue du 03/09/2026 : un compte doit toujours avoir un établissement). Choisissez-en un existant ou créez-le à la volée."

// Vide en premier ("compte vide", comportement historique de ce formulaire) — les
// 5 types épargne ensuite (fusion de l'écran Épargne dans Comptes, 03/09/2026,
// demande directe de l'utilisateur).
const OPTIONS_TYPE = [{ value: '', label: '— Compte vide —' }, ...TYPE_ACTIF_OPTIONS.filter((o) => TYPES_EPARGNE.has(o.value))]

/** Formulaire d'ajout d'un compte (nom + établissement, tous deux obligatoires
 * depuis le 03/09/2026) — patron `DetenteursCard.tsx`. Extrait de `ComptesPage.tsx`
 * pour être réutilisé tel quel dans l'assistant de bienvenue (`EtapeComptes.tsx`,
 * backlog X.3).
 *
 * Type/valeur initiale/versement mensuel (fusion de l'écran Épargne, 03/09/2026) :
 * un compte VIDE (type non choisi) suit le chemin historique (`createCompte`,
 * juste le contenant) ; un type épargne choisi crée en un seul geste la ligne ET
 * son compte 1:1 (`createHolding` avec `compte_nom`, même logique que l'ancien
 * formulaire dédié d'`EpargnePage.tsx`) — sans dupliquer un second bouton
 * « + Ajouter un compte » ailleurs sur l'écran. */
export default function AjoutCompteForm({ etablissements, onCreated }: { etablissements: Etablissement[]; onCreated: () => void }) {
  const [nom, setNom] = useState('')
  const [typeActif, setTypeActif] = useState('')
  const [valeurEstimee, setValeurEstimee] = useState('')
  const [versementMensuel, setVersementMensuel] = useState('')
  const [etablissementId, setEtablissementId] = useState('')
  const [etablissementNom, setEtablissementNom] = useState('')
  const [etablissementLogoKey, setEtablissementLogoKey] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const etablissementValide = etablissementId === NOUVEAU_ETABLISSEMENT ? etablissementNom.trim() !== '' : etablissementId !== ''
  const nouvelEtablissement = etablissementId === NOUVEAU_ETABLISSEMENT

  function reinitialiser() {
    setNom('')
    setTypeActif('')
    setValeurEstimee('')
    setVersementMensuel('')
    setEtablissementId('')
    setEtablissementNom('')
    setEtablissementLogoKey(null)
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!nom.trim() || !etablissementValide) return
    setSaving(true)
    setError(null)
    try {
      if (typeActif) {
        await api.createHolding({
          ticker: nom.trim().toUpperCase().replace(/\s+/g, '_'),
          nom: nom.trim(),
          quantite: 1,
          type_actif: typeActif,
          valeur_estimee: valeurEstimee ? Number(valeurEstimee) : null,
          versement_mensuel: versementMensuel ? Number(versementMensuel) : null,
          compte_nom: nom.trim(),
          etablissement_id: !nouvelEtablissement ? Number(etablissementId) : null,
          etablissement_nom: nouvelEtablissement ? etablissementNom.trim() || null : null,
          etablissement_logo_key: nouvelEtablissement ? etablissementLogoKey : null,
        })
      } else {
        let idCible = Number(etablissementId)
        if (nouvelEtablissement) {
          const cree = await api.createEtablissement(etablissementNom.trim(), etablissementLogoKey)
          idCible = cree.id
        }
        await api.createCompte(nom.trim(), idCible)
      }
      reinitialiser()
      onCreated()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleAdd} className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1 text-xs font-medium text-texte-attenue">
        <span className="inline-flex items-center gap-1">
          Nom <InfoBulle texte={AIDE_NOM_COMPTE} />
        </span>
        <input
          value={nom}
          onChange={(e) => setNom(e.target.value)}
          placeholder="PEA, Livret A..."
          className="w-40 rounded-md border border-bordure bg-surface px-2 py-1.5 text-sm text-texte"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-texte-attenue">
        Type
        <select
          value={typeActif}
          onChange={(e) => setTypeActif(e.target.value)}
          className="w-40 rounded-md border border-bordure bg-surface px-2 py-1.5 text-sm text-texte"
        >
          {OPTIONS_TYPE.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      {typeActif && (
        <>
          <label className="flex flex-col gap-1 text-xs font-medium text-texte-attenue">
            Valeur initiale (€, optionnel)
            <input
              type="number"
              step="any"
              min={0}
              value={valeurEstimee}
              onChange={(e) => setValeurEstimee(e.target.value)}
              className="w-32 rounded-md border border-bordure bg-surface px-2 py-1.5 text-sm text-texte"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-texte-attenue">
            Versement mensuel (€, optionnel)
            <input
              type="number"
              step="any"
              min={0}
              value={versementMensuel}
              onChange={(e) => setVersementMensuel(e.target.value)}
              className="w-40 rounded-md border border-bordure bg-surface px-2 py-1.5 text-sm text-texte"
            />
          </label>
        </>
      )}
      <label className="flex flex-col gap-1 text-xs font-medium text-texte-attenue">
        <span className="inline-flex items-center gap-1">
          Établissement <InfoBulle texte={AIDE_ETABLISSEMENT} />
        </span>
        <SelecteurEtablissement
          etablissements={etablissements}
          value={etablissementId}
          nomNouveau={etablissementNom}
          onValueChange={setEtablissementId}
          onNomNouveauChange={setEtablissementNom}
          logoKeyNouveau={etablissementLogoKey}
          onLogoKeyNouveauChange={setEtablissementLogoKey}
          required
          ariaLabel="Établissement"
          className="w-48 rounded-md border border-bordure bg-surface px-2 py-1.5 text-sm text-texte"
        />
      </label>
      <button
        type="submit"
        disabled={saving || !nom.trim() || !etablissementValide}
        className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-surface disabled:opacity-40"
      >
        + Nouveau compte
      </button>
      {error && <EtatErreur message={error} />}
    </form>
  )
}
