import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { CompteAvecSolde, Etablissement } from '../api/types'
import Card from '../components/Card'
import CompteDetailModal from '../components/CompteDetailModal'
import EtatErreur from '../components/EtatErreur'
import EtatVide from '../components/EtatVide'
import { SkeletonTexte } from '../components/Skeleton'
import { usePreferencesAffichage } from '../hooks/usePreferencesAffichage'
import { formatEuro } from '../utils/format'

const SANS_ETABLISSEMENT = 'Sans établissement'

/** Formulaire d'ajout d'un compte (nom + établissement optionnel) — patron
 * `DetenteursCard.tsx`. */
function AjoutCompteForm({ etablissements, onCreated }: { etablissements: Etablissement[]; onCreated: () => void }) {
  const [nom, setNom] = useState('')
  const [etablissementId, setEtablissementId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!nom.trim()) return
    setSaving(true)
    setError(null)
    try {
      await api.createCompte(nom.trim(), etablissementId ? Number(etablissementId) : null)
      setNom('')
      setEtablissementId('')
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
        Nom
        <input
          value={nom}
          onChange={(e) => setNom(e.target.value)}
          placeholder="PEA, Livret A..."
          className="w-40 rounded-md border border-bordure bg-surface px-2 py-1.5 text-sm text-texte"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-texte-attenue">
        Établissement
        <select
          value={etablissementId}
          onChange={(e) => setEtablissementId(e.target.value)}
          className="w-48 rounded-md border border-bordure bg-surface px-2 py-1.5 text-sm text-texte"
        >
          <option value="">— Sans établissement —</option>
          {etablissements.map((et) => (
            <option key={et.id} value={et.id}>
              {et.nom}
            </option>
          ))}
        </select>
      </label>
      <button
        type="submit"
        disabled={saving}
        className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-surface disabled:opacity-40"
      >
        + Nouveau compte
      </button>
      {error && <EtatErreur message={error} />}
    </form>
  )
}

/** Écran Comptes (backlog X.1) : liste de tous les comptes du foyer avec leur
 * solde, groupés par établissement — façon logiciel de budget. Couvre TOUS les
 * types d'actifs (contrairement à l'ancienne carte « Répartition par compte » du
 * Tableau de bord, restreinte au portefeuille financier), y compris l'immobilier et
 * l'épargne rattachés à un compte. */
export default function ComptesPage() {
  const { montantsMasques } = usePreferencesAffichage()
  const [lignes, setLignes] = useState<CompteAvecSolde[] | null>(null)
  const [etablissements, setEtablissements] = useState<Etablissement[]>([])
  const [error, setError] = useState<string | null>(null)
  const [compteOuvert, setCompteOuvert] = useState<number | null>(null)

  function charger() {
    setError(null)
    api
      .listComptesAvecSolde()
      .then(setLignes)
      .catch((err) => setError(err.message))
    api.listEtablissements().then(setEtablissements).catch(() => setEtablissements([]))
  }

  useEffect(charger, [])

  async function handleDelete(id: number, e: React.MouseEvent) {
    e.stopPropagation()
    try {
      await api.deleteCompte(id)
      charger()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  if (error) return <EtatErreur message={error} onReessayer={charger} />
  if (!lignes) return <SkeletonTexte lignes={5} />

  const soldeTotal = lignes.reduce((somme, l) => somme + l.solde, 0)

  // Regroupement par établissement (côté client, comme `comptesDisponibles` pour
  // Portefeuille) — un groupe « Sans établissement » pour les comptes non rattachés
  // ET pour le bucket « Sans compte » (lignes du foyer jamais rattachées à un
  // compte, `l.compte === null`).
  const groupes = new Map<string, CompteAvecSolde[]>()
  for (const ligne of lignes) {
    const cle = ligne.compte?.etablissement?.nom ?? SANS_ETABLISSEMENT
    const groupe = groupes.get(cle) ?? []
    groupe.push(ligne)
    groupes.set(cle, groupe)
  }
  const nomsGroupes = Array.from(groupes.keys()).sort((a, b) =>
    a === SANS_ETABLISSEMENT ? 1 : b === SANS_ETABLISSEMENT ? -1 : a.localeCompare(b, 'fr'),
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xl font-semibold text-texte">Comptes</h2>
        <span className="text-lg font-semibold text-texte">{formatEuro(soldeTotal, 0, montantsMasques)}</span>
      </div>
      <p className="text-sm text-texte-attenue">
        Tous les comptes du foyer — compte courant, PEA, compte-titres, assurance-vie, immobilier, épargne — groupés par
        établissement, avec leur solde. Clique sur un compte pour voir le détail et définir une répartition entre
        détenteurs pour tout le compte en une fois.
      </p>

      <Card title="Nouveau compte">
        <AjoutCompteForm etablissements={etablissements} onCreated={charger} />
      </Card>

      {lignes.length === 0 ? (
        <EtatVide
          titre="Aucun compte déclaré."
          description="Crée un compte ci-dessus, ou rattaches-en un directement depuis Portefeuille/Épargne lors de l'ajout d'une position."
        />
      ) : (
        nomsGroupes.map((nomGroupe) => (
          <Card key={nomGroupe} title={nomGroupe}>
            <ul className="divide-y divide-bordure">
              {groupes.get(nomGroupe)!.map((ligne) => {
                const estCliquable = Boolean(ligne.compte)
                return (
                  <li key={ligne.compte?.id ?? 'sans-compte'}>
                    <div
                      role={estCliquable ? 'button' : undefined}
                      tabIndex={estCliquable ? 0 : undefined}
                      onClick={() => ligne.compte && setCompteOuvert(ligne.compte.id)}
                      onKeyDown={(e) => {
                        if (ligne.compte && (e.key === 'Enter' || e.key === ' ')) {
                          e.preventDefault()
                          setCompteOuvert(ligne.compte.id)
                        }
                      }}
                      className={`flex items-center justify-between py-2.5 text-sm ${estCliquable ? 'cursor-pointer hover:text-texte' : ''}`}
                    >
                      <span className="text-texte">
                        {ligne.compte?.nom ?? 'Sans compte'}
                        <span className="ml-2 text-xs text-texte-attenue">
                          {ligne.nombre_lignes} ligne{ligne.nombre_lignes > 1 ? 's' : ''}
                        </span>
                      </span>
                      <span className="flex items-center gap-3">
                        <span className="font-medium text-texte">{formatEuro(ligne.solde, 2, montantsMasques)}</span>
                        {ligne.compte && (
                          <button
                            type="button"
                            onClick={(e) => handleDelete(ligne.compte!.id, e)}
                            className="text-xs text-negatif hover:underline"
                          >
                            Supprimer
                          </button>
                        )}
                      </span>
                    </div>
                  </li>
                )
              })}
            </ul>
          </Card>
        ))
      )}

      {compteOuvert && <CompteDetailModal compteId={compteOuvert} onClose={() => setCompteOuvert(null)} />}
    </div>
  )
}
