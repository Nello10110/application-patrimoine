import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { Detenteur, LienPartage } from '../api/types'
import Card from './Card'
import EtatErreur from './EtatErreur'
import EtatVide from './EtatVide'
import { SkeletonTexte } from './Skeleton'

/** Liens de partage révocables (backlog 2.Q.1) — premier point d'accès PUBLIC de
 * l'application, sans authentification : réservée au propriétaire (comme les
 * autres réglages de sécurité), jamais un membre. `token` reste affiché à chaque
 * relecture (cf. `schemas.LienPartageOut`) : un lien est fait pour être recopié,
 * contrairement à une session. */
export default function PartageCard() {
  const [liens, setLiens] = useState<LienPartage[]>([])
  const [detenteurs, setDetenteurs] = useState<Detenteur[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [erreurCreation, setErreurCreation] = useState<string | null>(null)

  const [nom, setNom] = useState('')
  const [detenteurId, setDetenteurId] = useState<string>('')
  const [dureeJours, setDureeJours] = useState(30)
  const [inclurePatrimoineNet, setInclurePatrimoineNet] = useState(true)
  const [inclureRepartition, setInclureRepartition] = useState(true)
  const [inclurePerformance, setInclurePerformance] = useState(true)
  const [inclureBudget, setInclureBudget] = useState(false)
  const [inclureObjectifs, setInclureObjectifs] = useState(false)
  const [masquerValeurs, setMasquerValeurs] = useState(false)
  const [code, setCode] = useState('')

  function load() {
    setLoading(true)
    setError(null)
    Promise.all([api.listLiensPartage(), api.listDetenteurs()])
      .then(([l, d]) => {
        setLiens(l)
        setDetenteurs(d)
      })
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!nom.trim()) return
    setSaving(true)
    setErreurCreation(null)
    try {
      await api.createLienPartage({
        nom: nom.trim(),
        detenteur_id: detenteurId ? Number(detenteurId) : null,
        duree_jours: dureeJours,
        inclure_patrimoine_net: inclurePatrimoineNet,
        inclure_repartition: inclureRepartition,
        inclure_performance: inclurePerformance,
        inclure_budget: inclureBudget,
        inclure_objectifs: inclureObjectifs,
        masquer_valeurs: masquerValeurs,
        code: code.trim() || null,
      })
      setNom('')
      setCode('')
      load()
    } catch (err) {
      setErreurCreation((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function handleRevoke(id: number) {
    setError(null)
    try {
      await api.revokeLienPartage(id)
      load()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  function urlPublique(token: string): string {
    return `${window.location.origin}/partage/${token}`
  }

  return (
    <Card title="Liens de partage">
      <p className="mb-4 text-sm text-texte">
        Un lien anonyme, révocable à tout moment, donnant à un tiers (banque, notaire, famille) une vue en lecture
        seule limitée aux sections choisies ci-dessous — jamais le détail position par position, les transactions, ni
        les comptes. Budget et objectifs ne sont pas filtrés par détenteur : n'active ces deux sections avec un
        détenteur sélectionné que si tu veux les partager pour tout le foyer.
      </p>

      {loading ? (
        <SkeletonTexte />
      ) : liens.length === 0 ? (
        <EtatVide titre="Aucun lien de partage créé." />
      ) : (
        <ul className="mb-4 divide-y divide-bordure">
          {liens.map((lien) => {
            const revoque = lien.revoked_at !== null
            const expire = !revoque && new Date(lien.expires_at) < new Date()
            return (
              <li key={lien.id} className="py-2 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <span className="font-medium text-texte">{lien.nom}</span>{' '}
                    {revoque && <span className="text-xs text-negatif">révoqué</span>}
                    {expire && <span className="text-xs text-avertissement">expiré</span>}
                    {lien.code_requis && !revoque && !expire && <span className="text-xs text-texte-attenue">code requis</span>}
                  </div>
                  {!revoque && (
                    <button onClick={() => handleRevoke(lien.id)} className="text-xs text-negatif hover:underline">
                      Révoquer
                    </button>
                  )}
                </div>
                {!revoque && !expire && (
                  <input
                    readOnly
                    value={urlPublique(lien.token)}
                    onFocus={(e) => e.currentTarget.select()}
                    className="mt-1 w-full rounded-md border border-bordure bg-surface-elevee px-2 py-1 text-xs text-texte-attenue"
                  />
                )}
              </li>
            )
          })}
        </ul>
      )}

      <form onSubmit={handleCreate} className="space-y-3 border-t border-bordure pt-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs font-medium text-texte-attenue">
            Nom (pour te repérer)
            <input
              value={nom}
              onChange={(e) => setNom(e.target.value)}
              placeholder="Pour la banque"
              className="w-48 rounded-md border border-bordure bg-surface px-2 py-1.5 text-sm text-texte"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-texte-attenue">
            Détenteur (optionnel)
            <select
              value={detenteurId}
              onChange={(e) => setDetenteurId(e.target.value)}
              className="w-40 rounded-md border border-bordure bg-surface px-2 py-1.5 text-sm text-texte"
            >
              <option value="">Foyer entier</option>
              {detenteurs.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.nom}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-texte-attenue">
            Durée (jours)
            <input
              value={dureeJours}
              onChange={(e) => setDureeJours(Number(e.target.value))}
              type="number"
              min={1}
              max={365}
              className="w-24 rounded-md border border-bordure bg-surface px-2 py-1.5 text-sm text-texte"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-texte-attenue">
            Code d'accès (optionnel)
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="min. 4 caractères"
              className="w-36 rounded-md border border-bordure bg-surface px-2 py-1.5 text-sm text-texte"
            />
          </label>
        </div>

        <div className="flex flex-wrap gap-4 text-sm text-texte">
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={inclurePatrimoineNet} onChange={(e) => setInclurePatrimoineNet(e.target.checked)} />
            Patrimoine net
          </label>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={inclureRepartition} onChange={(e) => setInclureRepartition(e.target.checked)} />
            Exposition consolidée
          </label>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={inclurePerformance} onChange={(e) => setInclurePerformance(e.target.checked)} />
            Rentabilité
          </label>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={inclureBudget} onChange={(e) => setInclureBudget(e.target.checked)} />
            Budget
          </label>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={inclureObjectifs} onChange={(e) => setInclureObjectifs(e.target.checked)} />
            Objectifs
          </label>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={masquerValeurs} onChange={(e) => setMasquerValeurs(e.target.checked)} />
            Masquer les montants (proportions seulement)
          </label>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-surface disabled:opacity-40"
        >
          {saving ? 'Création...' : 'Créer le lien'}
        </button>
        {erreurCreation && <p className="text-sm text-negatif">{erreurCreation}</p>}
      </form>

      {error && <EtatErreur message={error} onReessayer={load} />}
    </Card>
  )
}
