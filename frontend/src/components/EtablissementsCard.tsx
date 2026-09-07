import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { Etablissement } from '../api/types'
import Card from './Card'
import CatalogueEtablissementPicker from './CatalogueEtablissementPicker'
import EtablissementEditModal from './EtablissementEditModal'
import EtatErreur from './EtatErreur'
import EtatVide from './EtatVide'
import EtablissementLogo from './EtablissementLogo'
import { SkeletonTexte } from './Skeleton'
import { invaliderLogos } from '../utils/logosEtablissements'

/** Établissements financiers (écran Comptes, backlog X.1) : déclarés une fois
 * ici, réutilisés ensuite pour regrouper les comptes à l'écran (ex. « Caisse
 * d'Épargne » contenant un compte courant ET une assurance-vie) — même patron que
 * `DetenteursCard.tsx`. */
export default function EtablissementsCard({
  etablissements: etablissementsFournis,
  onModifies,
  sansCarte = false,
}: {
  /** Liste fournie par l'appelant. Absente (écran Réglages), la carte la charge
   * elle-même. Fournie (assistant de bienvenue), elle évite un second
   * `GET /etablissements` : l'étape porte déjà cette liste pour son formulaire
   * d'ajout de compte, et montait cette carte qui la redemandait (backlog Z.1). */
  etablissements?: Etablissement[]
  /** À appeler après création, renommage ou suppression, pour que l'appelant
   * rafraîchisse la liste qu'il porte. */
  onModifies?: () => void
  /** Rendu SANS son enveloppe `Card` : l'écran Comptes l'affiche désormais dans une
   * feuille modale qui porte déjà son propre titre et son propre panneau de verre
   * (maquette de la refonte) — une carte dans une feuille ferait deux cadres
   * imbriqués pour un seul contenu. */
  sansCarte?: boolean
} = {}) {
  const [etablissementsCharges, setEtablissements] = useState<Etablissement[]>([])
  const autonome = etablissementsFournis === undefined
  const etablissements = etablissementsFournis ?? etablissementsCharges
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [nom, setNom] = useState('')
  const [nomLogoKey, setNomLogoKey] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  // Édition en modale depuis le 05/09/2026 (retour utilisateur : « pouvoir éditer
  // l'établissement avec une vue dédiée ») — le renommage en ligne d'avant ne
  // pouvait pas accueillir la gestion du logo (récupération, téléversement,
  // adresse, suppression) sans rendre la ligne illisible.
  const [enEdition, setEnEdition] = useState<Etablissement | null>(null)

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
      const cree = await api.createEtablissement(nom.trim(), nomLogoKey)
      // Établissement choisi dans le catalogue : son logo officiel est récupéré
      // dans la foulée (retour utilisateur du 05/09/2026, « cherché et mis en cache
      // automatiquement ») plutôt qu'à la prochaine exécution hebdomadaire.
      // Volontairement SANS `await` : la création ne doit pas attendre le site de la
      // banque (plusieurs secondes, parfois injoignable). Le badge apparaît dès que
      // l'image arrive, et un échec est toléré en silence — le badge généré reste
      // affiché, et l'utilisateur peut toujours fournir une image depuis la vue
      // d'édition.
      if (nomLogoKey) {
        void api
          .recupererLogoCatalogue(cree.id)
          .then(() => invaliderLogos())
          .catch(() => undefined)
      }
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

  const contenu = (
    <>
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
          {etablissements.map((e) => (
            <li key={e.id} className="flex items-center justify-between py-2 text-sm">
              <span className="flex items-center gap-2 text-texte">
                <EtablissementLogo etablissementId={e.id} logoKey={e.logo_key} nom={e.nom} />
                {e.nom}
              </span>
              <span className="flex items-center gap-3">
                <button onClick={() => setEnEdition(e)} className="inline-flex min-h-11 items-center md:min-h-0 text-xs text-accent hover:underline">
                  Modifier
                </button>
                <button onClick={() => handleDelete(e.id)} className="inline-flex min-h-11 items-center md:min-h-0 text-xs text-negatif hover:underline">
                  Supprimer
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {enEdition && (
        <EtablissementEditModal
          etablissement={enEdition}
          onClose={() => setEnEdition(null)}
          onEnregistre={load}
        />
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
              className="w-48 rounded-control border border-bordure bg-surface px-2 py-1.5 text-sm text-texte"
            />
          </label>
          <button
            type="submit"
            disabled={saving}
            className="rounded-control bg-accent px-4 py-2 text-sm font-medium text-surface disabled:opacity-40"
          >
            Ajouter
          </button>
        </div>
      </form>
      {error && <EtatErreur message={error} onReessayer={load} />}
    </>
  )

  // Sans enveloppe quand l'appelant fournit déjà son cadre (feuille modale de
  // l'écran Comptes) : une carte dans une feuille ferait deux panneaux imbriqués
  // pour un seul contenu.
  return sansCarte ? contenu : <Card title="Établissements">{contenu}</Card>
}
