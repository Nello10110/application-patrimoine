import { useState } from 'react'
import { api } from '../api/client'
import type { Etablissement } from '../api/types'
import EtatErreur from './EtatErreur'
import InfoBulle from './InfoBulle'
import SelecteurEtablissement, { NOUVEAU_ETABLISSEMENT } from './SelecteurEtablissement'

const AIDE_NOM_COMPTE =
  "Le nom que VOUS lui donnez, pas un numéro de compte : « PEA Boursorama », « Livret A », « Appartement Lyon ». C'est ce nom qui apparaîtra partout dans l'application."
const AIDE_ETABLISSEMENT =
  "La banque ou le courtier qui héberge ce compte (revue du 03/09/2026 : un compte doit toujours avoir un établissement). Choisissez-en un existant ou créez-le à la volée."

/** Formulaire d'ajout d'un compte (nom + établissement, tous deux obligatoires
 * depuis le 03/09/2026) — patron `DetenteursCard.tsx`. Extrait de `ComptesPage.tsx`
 * pour être réutilisé tel quel dans l'assistant de bienvenue (`EtapeComptes.tsx`,
 * backlog X.3). */
export default function AjoutCompteForm({ etablissements, onCreated }: { etablissements: Etablissement[]; onCreated: () => void }) {
  const [nom, setNom] = useState('')
  const [etablissementId, setEtablissementId] = useState('')
  const [etablissementNom, setEtablissementNom] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const etablissementValide = etablissementId === NOUVEAU_ETABLISSEMENT ? etablissementNom.trim() !== '' : etablissementId !== ''

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!nom.trim() || !etablissementValide) return
    setSaving(true)
    setError(null)
    try {
      let idCible = Number(etablissementId)
      if (etablissementId === NOUVEAU_ETABLISSEMENT) {
        const cree = await api.createEtablissement(etablissementNom.trim())
        idCible = cree.id
      }
      await api.createCompte(nom.trim(), idCible)
      setNom('')
      setEtablissementId('')
      setEtablissementNom('')
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
        <span className="inline-flex items-center gap-1">
          Établissement <InfoBulle texte={AIDE_ETABLISSEMENT} />
        </span>
        <SelecteurEtablissement
          etablissements={etablissements}
          value={etablissementId}
          nomNouveau={etablissementNom}
          onValueChange={setEtablissementId}
          onNomNouveauChange={setEtablissementNom}
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
