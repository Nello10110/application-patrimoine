import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { Etablissement } from '../api/types'
import Card from './Card'
import CatalogueEtablissementPicker from './CatalogueEtablissementPicker'
import EtatErreur from './EtatErreur'
import EtatVide from './EtatVide'
import EtablissementLogo from './EtablissementLogo'
import { SkeletonTexte } from './Skeleton'

/** Établissements financiers (écran Comptes, backlog X.1) : déclarés une fois
 * ici, réutilisés ensuite pour regrouper les comptes à l'écran (ex. « Caisse
 * d'Épargne » contenant un compte courant ET une assurance-vie) — même patron que
 * `DetenteursCard.tsx`. */
export default function EtablissementsCard({
  etablissements: etablissementsFournis,
  onModifies,
}: {
  /** Liste fournie par l'appelant. Absente (écran Réglages), la carte la charge
   * elle-même. Fournie (assistant de bienvenue), elle évite un second
   * `GET /etablissements` : l'étape porte déjà cette liste pour son formulaire
   * d'ajout de compte, et montait cette carte qui la redemandait (backlog Z.1). */
  etablissements?: Etablissement[]
  /** À appeler après création, renommage ou suppression, pour que l'appelant
   * rafraîchisse la liste qu'il porte. */
  onModifies?: () => void
} = {}) {
  const [etablissementsCharges, setEtablissements] = useState<Etablissement[]>([])
  const autonome = etablissementsFournis === undefined
  const etablissements = etablissementsFournis ?? etablissementsCharges
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [nom, setNom] = useState('')
  const [nomLogoKey, setNomLogoKey] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  // Renommage inline (édition en place, pas de modale) : `idEnEdition` porte
  // l'établissement actuellement ouvert en édition, `null` sinon — un seul à la fois.
  const [idEnEdition, setIdEnEdition] = useState<number | null>(null)
  const [nomEdition, setNomEdition] = useState('')

  function load() {
    // En mode piloté, c'est l'appelant qui détient la liste : on le prévient
    // plutôt que de recharger pour notre compte.
    if (!autonome) {
      onModifies?.()
      return
    }
    setLoading(true)
    api
      .listEtablissements()
      .then(setEtablissements)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (!autonome) {
      setLoading(false)
      return
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `load` est stable ; ne dépend que du mode.
  }, [autonome])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!nom.trim()) return
    setSaving(true)
    setError(null)
    try {
      await api.createEtablissement(nom.trim(), nomLogoKey)
      setNom('')
      setNomLogoKey(null)
      load()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: number) {
    setError(null)
    try {
      await api.deleteEtablissement(id)
      load()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  function commencerEdition(e: Etablissement) {
    setIdEnEdition(e.id)
    setNomEdition(e.nom)
    setError(null)
  }

  async function handleRenommer(e: React.FormEvent, id: number) {
    e.preventDefault()
    if (!nomEdition.trim()) return
    setSaving(true)
    setError(null)
    try {
      await api.updateEtablissement(id, nomEdition.trim())
      setIdEnEdition(null)
      load()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card title="Établissements">
      <p className="mb-4 text-sm text-texte">
        Banques et courtiers, déclarés une fois, réutilisés pour regrouper tes comptes à l'écran{' '}
        <span className="font-medium text-texte">Comptes</span> (ex. « Caisse d'Épargne » contenant un compte courant et une
        assurance-vie). Supprimer un établissement ne touche jamais les comptes qui lui étaient rattachés — ils retombent
        simplement dans « Sans établissement ».
      </p>

      {loading ? (
        <SkeletonTexte />
      ) : etablissements.length === 0 ? (
        <EtatVide titre="Aucun établissement déclaré." />
      ) : (
        <ul className="mb-4 divide-y divide-bordure">
          {etablissements.map((e) =>
            idEnEdition === e.id ? (
              <li key={e.id} className="py-2">
                <form onSubmit={(ev) => handleRenommer(ev, e.id)} className="flex items-center gap-2">
                  <input
                    value={nomEdition}
                    onChange={(ev) => setNomEdition(ev.target.value)}
                    aria-label="Nom (édition)"
                    className="w-48 rounded-md border border-bordure bg-surface px-2 py-1.5 text-sm text-texte"
                  />
                  <button type="submit" disabled={saving || !nomEdition.trim()} className="text-xs text-accent hover:underline disabled:opacity-40">
                    Enregistrer
                  </button>
                  <button type="button" onClick={() => setIdEnEdition(null)} className="text-xs text-texte-attenue hover:underline">
                    Annuler
                  </button>
                </form>
              </li>
            ) : (
              <li key={e.id} className="flex items-center justify-between py-2 text-sm">
                <span className="flex items-center gap-2 text-texte">
                  <EtablissementLogo logoKey={e.logo_key} nom={e.nom} />
                  {e.nom}
                </span>
                <span className="flex items-center gap-3">
                  <button onClick={() => commencerEdition(e)} className="text-xs text-accent hover:underline">
                    Modifier
                  </button>
                  <button onClick={() => handleDelete(e.id)} className="text-xs text-negatif hover:underline">
                    Supprimer
                  </button>
                </span>
              </li>
            ),
          )}
        </ul>
      )}

      <form onSubmit={handleAdd} className="flex flex-col gap-3 border-t border-bordure pt-4">
        <CatalogueEtablissementPicker
          selection={nomLogoKey}
          onSelect={(cle, nomConnu) => {
            setNomLogoKey(cle)
            setNom(nomConnu)
          }}
        />
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs font-medium text-texte-attenue">
            Nom
            <input
              value={nom}
              onChange={(e) => {
                setNom(e.target.value)
                setNomLogoKey(null)
              }}
              placeholder="Caisse d'Épargne"
              className="w-48 rounded-md border border-bordure bg-surface px-2 py-1.5 text-sm text-texte"
            />
          </label>
          <button
            type="submit"
            disabled={saving}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-surface disabled:opacity-40"
          >
            Ajouter
          </button>
        </div>
      </form>
      {error && <EtatErreur message={error} onReessayer={load} />}
    </Card>
  )
}
