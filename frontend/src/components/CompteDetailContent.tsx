import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import type { Compte, Etablissement, Holding, Loan } from '../api/types'
import { usePreferencesAffichage } from '../hooks/usePreferencesAffichage'
import { formatEuro } from '../utils/format'
import Card from './Card'
import EtatErreur from './EtatErreur'
import EtatVide from './EtatVide'
import { SkeletonTexte } from './Skeleton'
import { useEditeurQuotites } from '../hooks/useEditeurQuotites'


/** Nom + établissement, modifiables inline — même patron que `ModifierCompteForm`
 * dans `EpargnePage.tsx`. */
function CompteInfosForm({ compte, onSaved }: { compte: Compte; onSaved: () => void }) {
  const [nom, setNom] = useState(compte.nom)
  const [etablissements, setEtablissements] = useState<Etablissement[]>([])
  const [etablissementId, setEtablissementId] = useState(compte.etablissement ? String(compte.etablissement.id) : '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.listEtablissements().then(setEtablissements).catch(() => setEtablissements([]))
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!nom.trim()) return
    setSaving(true)
    setError(null)
    try {
      await api.updateCompte(compte.id, { nom: nom.trim(), etablissement_id: etablissementId ? Number(etablissementId) : null })
      onSaved()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1 text-xs font-medium text-texte-attenue">
        Nom du compte
        <input
          value={nom}
          onChange={(e) => setNom(e.target.value)}
          className="w-48 rounded-md border border-bordure bg-surface px-2 py-1.5 text-sm text-texte"
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
        disabled={saving || !nom.trim()}
        className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-surface disabled:opacity-40"
      >
        Enregistrer
      </button>
      {error && <span className="text-sm text-negatif">{error}</span>}
    </form>
  )
}

/** Emprunts rattachés à une ligne de ce compte (`Loan.holding_id`) — purement
 * informatif, pour que la répartition entre détenteurs ci-dessous (qui s'applique
 * AUSSI à ces emprunts, backlog X.4) ne surprenne jamais. Liste déjà filtrée par
 * l'appelant (`CompteDetailContent`, qui charge `api.listLoans()` une seule fois et
 * la partage avec `QuotitesCompte` pour son décompte) — composant purement
 * d'affichage, pas de fetch ici. */
function EmpruntsRattaches({ emprunts, montantsMasques }: { emprunts: Loan[]; montantsMasques: boolean }) {
  if (emprunts.length === 0) return null

  return (
    <Card title="Emprunts rattachés">
      <ul className="divide-y divide-bordure">
        {emprunts.map((e) => (
          <li key={e.id} className="flex items-center justify-between py-2 text-sm">
            <span className="font-medium text-texte">{e.libelle}</span>
            <span className="text-texte">{formatEuro(e.capital_restant_du, 2, montantsMasques)} restant</span>
          </li>
        ))}
      </ul>
    </Card>
  )
}

/** Répartition entre détenteurs pour TOUT le compte (backlog X.1, cœur de la
 * demande : le dire une fois plutôt que ligne par ligne) — formulaire vierge par
 * défaut (pas de pré-remplissage), volontairement : si les lignes du compte ont déjà
 * des répartitions divergentes (saisies avant l'existence de cet écran), tenter de
 * les réconcilier automatiquement serait fragile ; l'enregistrement REMPLACE la
 * répartition de chaque ligne, ce que le texte ci-dessous explicite. S'applique
 * aussi aux emprunts rattachés (backlog X.4, `comptes_service.set_quotites_compte`),
 * d'où le paramètre `nombreEmprunts` pour l'expliciter dans le texte. */
function QuotitesCompte({ compteId, nombreLignes, nombreEmprunts }: { compteId: number; nombreLignes: number; nombreEmprunts: number }) {
  const { detenteurs, erreurChargement, rechargerDetenteurs, saisie, setValeur, total, totalValide, saving, error, enregistre, handleSave } =
    useEditeurQuotites({ enregistrer: (quotites) => api.setCompteQuotites(compteId, quotites) })

  if (nombreLignes === 0) return null
  if (erreurChargement !== null) {
    return (
      <Card title="Répartition entre détenteurs">
        <EtatErreur message={`Impossible de charger les détenteurs : ${erreurChargement}`} onReessayer={rechargerDetenteurs} />
      </Card>
    )
  }
  if (detenteurs === null) return <SkeletonTexte lignes={1} />
  if (detenteurs.length === 0) return null

  return (
    <Card title="Répartition entre détenteurs">
      <p className="mb-4 text-sm text-texte">
        S'applique à TOUTES les lignes de ce compte ({nombreLignes} ligne{nombreLignes > 1 ? 's' : ''}
        {nombreEmprunts > 0 && <>, et {nombreEmprunts} emprunt{nombreEmprunts > 1 ? 's' : ''} rattaché{nombreEmprunts > 1 ? 's' : ''}</>}) —
        remplace la répartition actuellement enregistrée sur chacune, plutôt que de la définir ligne par ligne.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        {detenteurs.map((d) => (
          <label key={d.id} className="flex flex-col gap-1 text-xs font-medium text-texte-attenue">
            {d.nom}
            <input
              type="number"
              min={0}
              max={100}
              step="any"
              value={saisie[d.id] ?? ''}
              onChange={(e) => setValeur(d.id, e.target.value)}
              className="w-20 rounded-md border border-bordure bg-surface px-2 py-1.5 text-sm text-texte"
            />
          </label>
        ))}
        <button
          type="button"
          onClick={handleSave}
          disabled={!totalValide || saving}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-surface disabled:opacity-40"
        >
          Enregistrer
        </button>
      </div>
      {!totalValide && <p className="mt-2 text-sm text-negatif">Total actuel : {total.toFixed(2)} % (doit faire 100 %)</p>}
      {enregistre && <p className="mt-2 text-sm text-positif">Répartition appliquée à toutes les lignes du compte.</p>}
      {error && <p className="mt-2 text-sm text-negatif">{error}</p>}
    </Card>
  )
}

/** Contenu détaillé d'un compte — partagé entre `CompteDetailModal` et
 * `CompteDetailPage`, même patron que `HoldingDetailContent`. */
export default function CompteDetailContent({
  compte,
  holdings,
  onChanged,
}: {
  compte: Compte
  holdings: Holding[]
  onChanged: () => void
}) {
  const { montantsMasques } = usePreferencesAffichage()
  const solde = holdings.reduce((somme, h) => somme + (h.valeur ?? 0), 0)
  const [emprunts, setEmprunts] = useState<Loan[] | null>(null)

  useEffect(() => {
    api.listLoans().then(setEmprunts).catch(() => setEmprunts([]))
  }, [])

  const holdingIds = holdings.map((h) => h.id)
  const empruntsRattaches = (emprunts ?? []).filter((e) => e.holding_id !== null && holdingIds.includes(e.holding_id))

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-texte">{compte.nom}</h2>
        <p className="text-sm text-texte-attenue">{compte.etablissement?.nom ?? 'Sans établissement'}</p>
      </div>

      <Card title="Informations">
        <CompteInfosForm compte={compte} onSaved={onChanged} />
      </Card>

      <Card title="Solde">
        <p className="text-2xl font-semibold text-texte">{formatEuro(solde, 2, montantsMasques)}</p>
        <p className="mt-1 text-xs text-texte-attenue">
          {holdings.length} ligne{holdings.length > 1 ? 's' : ''} rattachée{holdings.length > 1 ? 's' : ''}
        </p>
      </Card>

      <Card title="Lignes rattachées">
        {holdings.length === 0 ? (
          <EtatVide
            titre="Aucune ligne rattachée à ce compte."
            description="Rattache une position depuis Portefeuille (formulaire d'ajout ou édition d'une ligne) ou l'écran Épargne."
          />
        ) : (
          <ul className="divide-y divide-bordure">
            {holdings.map((h) => (
              <li key={h.id} className="flex items-center justify-between py-2 text-sm">
                <Link to={`/patrimoine/${encodeURIComponent(h.ticker)}`} className="font-medium text-texte hover:underline">
                  {h.nom ?? h.ticker}
                </Link>
                <span className="text-texte">{formatEuro(h.valeur, 2, montantsMasques)}</span>
              </li>
            ))}
          </ul>
        )}
        {holdings.length === 1 && (
          <p className="mt-3 text-xs text-texte-attenue">
            Pour mettre à jour la valeur de cette ligne (immobilier, épargne...), ouvre sa fiche détaillée ci-dessus.
          </p>
        )}
      </Card>

      <EmpruntsRattaches emprunts={empruntsRattaches} montantsMasques={montantsMasques} />

      <QuotitesCompte compteId={compte.id} nombreLignes={holdings.length} nombreEmprunts={empruntsRattaches.length} />
    </div>
  )
}
