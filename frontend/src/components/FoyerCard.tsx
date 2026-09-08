import { useState } from 'react'
import { api } from '../api/client'
import { useAuth } from '../hooks/useAuth'
import Card from './Card'
import { PrimaryButton } from './Controls'
import EtatErreur from './EtatErreur'
import { Field, Input } from './Field'

/** Nom du foyer (revue du 05/09/2026, gestion du foyer dans sa globalité) — réglage
 * partagé par tout le foyer (propriétaire, membres, invités voient tous le même),
 * éditable par le propriétaire seul. Sert aussi de phrase de confirmation pour la
 * remise à zéro complète des données (`SauvegardeDonneesCard.tsx`) une fois défini. */
export default function FoyerCard() {
  const { user, refetchUser } = useAuth()
  const [nom, setNom] = useState(user?.foyer_nom ?? '')
  const [saving, setSaving] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [succes, setSucces] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!nom.trim()) return
    setSaving(true)
    setErreur(null)
    setSucces(null)
    try {
      await api.updateFoyerNom(nom.trim())
      await refetchUser()
      setSucces('Nom enregistré.')
    } catch (err) {
      setErreur((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card title="Mon foyer">
      <p className="mb-4 text-sm text-texte-attenue">
        Le nom du foyer est visible par tous ses comptes (propriétaire, membres, invités). Une fois défini, il sert
        aussi de phrase de confirmation avant une remise à zéro complète des données.
      </p>
      <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
        <Field label="Nom du foyer" className="w-64">
          <Input value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Famille Dupont" maxLength={60} />
        </Field>
        <PrimaryButton type="submit" disabled={saving || !nom.trim()}>
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </PrimaryButton>
      </form>
      {succes && <p className="mt-3 text-sm text-positif">{succes}</p>}
      {erreur && <EtatErreur message={erreur} />}
    </Card>
  )
}
