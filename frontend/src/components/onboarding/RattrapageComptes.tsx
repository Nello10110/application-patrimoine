import { useEffect, useState } from 'react'
import { api } from '../../api/client'
import type { Compte, Etablissement, Holding } from '../../api/types'
import { useAuth } from '../../hooks/useAuth'
import { formatEuro } from '../../utils/format'
import { TYPES_ACTIF_SANS_ETABLISSEMENT } from '../../utils/holdingCategories'
import Card from '../Card'
import EtatErreur from '../EtatErreur'
import { SkeletonTexte } from '../Skeleton'
import SelecteurEtablissement, { NOUVEAU_ETABLISSEMENT } from '../SelecteurEtablissement'

const NOUVEAU_COMPTE = '__nouveau__'

interface LigneForm {
  compte_id: string
  compte_nom: string
  etablissement_id: string
  etablissement_nom: string
}

function ligneVierge(): LigneForm {
  return { compte_id: '', compte_nom: '', etablissement_id: '', etablissement_nom: '' }
}

/** Écran de rattrapage bloquant (revue du 03/09/2026, compte obligatoire sur une
 * ligne financière) — affiché plein cadre à la place de l'application (cf.
 * `App.tsx` : `user.holdings_sans_compte > 0`), même traitement visuel que
 * `WelcomeWizard.tsx` (fond `bg-surface-elevee`, carte centrée). Décision arbitrée
 * avec l'utilisateur : un gate bloquant plutôt qu'un simple bandeau — les lignes
 * historiques (importées avant cette règle) doivent être résolues avant de
 * continuer, pas juste signalées.
 *
 * Charge son propre `GET /portfolio/holdings` (filtré côté client sur `compte ===
 * null` et un `type_actif` non dispensé) plutôt que de réutiliser une liste
 * existante : cet écran s'affiche AVANT tout le reste de l'application, aucune
 * page n'a encore chargé quoi que ce soit à ce stade.
 *
 * Chaque ligne résolue individuellement (bouton « Valider ») disparaît aussitôt de
 * la liste locale — pas besoin d'attendre un rechargement complet. Une fois la
 * liste vide, « Continuer » recharge l'utilisateur (`refetchUser`) : le compteur
 * `holdings_sans_compte` retombe à 0, ce gate se lève de lui-même au rendu suivant
 * de `App.tsx`, sans flag de sortie séparé à gérer ici. */
export default function RattrapageComptes() {
  const { refetchUser } = useAuth()
  const [holdings, setHoldings] = useState<Holding[] | null>(null)
  const [comptes, setComptes] = useState<Compte[]>([])
  const [etablissements, setEtablissements] = useState<Etablissement[]>([])
  const [forms, setForms] = useState<Record<number, LigneForm>>({})
  const [savingId, setSavingId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [finishing, setFinishing] = useState(false)

  function charger() {
    setError(null)
    Promise.all([api.listHoldings(), api.listComptes(), api.listEtablissements()])
      .then(([hs, cs, es]) => {
        setHoldings(hs.filter((h) => h.compte === null && !TYPES_ACTIF_SANS_ETABLISSEMENT.has(h.type_actif ?? '')))
        setComptes(cs)
        setEtablissements(es)
      })
      .catch((err) => setError(err.message))
  }

  useEffect(charger, [])

  function formPour(id: number): LigneForm {
    return forms[id] ?? ligneVierge()
  }

  function majForm(id: number, patch: Partial<LigneForm>) {
    setForms({ ...forms, [id]: { ...formPour(id), ...patch } })
  }

  async function resoudre(h: Holding) {
    const form = formPour(h.id)
    const nouveauCompte = form.compte_id === NOUVEAU_COMPTE
    const nouvelEtablissement = form.etablissement_id === NOUVEAU_ETABLISSEMENT
    setSavingId(h.id)
    setError(null)
    try {
      await api.updateHolding(h.id, {
        compte_id: !nouveauCompte && form.compte_id ? Number(form.compte_id) : null,
        compte_nom: nouveauCompte ? form.compte_nom.trim() || null : null,
        etablissement_id: nouveauCompte && !nouvelEtablissement && form.etablissement_id ? Number(form.etablissement_id) : null,
        etablissement_nom: nouveauCompte && nouvelEtablissement ? form.etablissement_nom.trim() || null : null,
      })
      setHoldings((prev) => (prev ?? []).filter((x) => x.id !== h.id))
      // Un compte (et son établissement) a pu être créé à la volée : recharge les
      // listes pour qu'ils apparaissent dans les sélecteurs des lignes suivantes.
      if (nouveauCompte) {
        api.listComptes().then(setComptes).catch(() => {})
        if (nouvelEtablissement) api.listEtablissements().then(setEtablissements).catch(() => {})
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSavingId(null)
    }
  }

  async function continuer() {
    setFinishing(true)
    try {
      await refetchUser()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setFinishing(false)
    }
  }

  if (holdings === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-elevee px-6 py-10">
        <div className="w-full max-w-lg">
          <SkeletonTexte lignes={4} />
        </div>
      </div>
    )
  }

  const toutesResolues = holdings.length === 0

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-elevee px-6 py-10">
      <div className="w-full max-w-2xl">
        <h1 className="mb-2 text-center text-xl font-semibold text-texte">Rattacher vos lignes à un compte</h1>
        <p className="mb-6 text-center text-sm text-texte-attenue">
          Chaque ligne financière doit désormais être rattachée à un compte (l'immobilier, un véhicule ou un autre bien
          en restent dispensés). Choisissez un compte existant ou créez-en un pour chacune des lignes ci-dessous.
        </p>

        <Card>
          {toutesResolues ? (
            <p className="py-6 text-center text-sm text-texte">Toutes vos lignes sont désormais rattachées à un compte.</p>
          ) : (
            <ul className="divide-y divide-bordure">
              {holdings.map((h) => {
                const form = formPour(h.id)
                const validable = Boolean(form.compte_id) && (form.compte_id !== NOUVEAU_COMPTE || form.compte_nom.trim() !== '')
                return (
                  <li key={h.id} className="flex flex-wrap items-end gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-texte">{h.nom ?? h.ticker}</p>
                      <p className="text-xs text-texte-attenue">
                        {h.ticker} · {formatEuro(h.valeur, 2, false)}
                      </p>
                    </div>
                    <label className="flex flex-col gap-1 text-xs font-medium text-texte-attenue">
                      Compte
                      <select
                        value={form.compte_id}
                        onChange={(e) => majForm(h.id, { compte_id: e.target.value })}
                        aria-label={`Compte pour ${h.ticker}`}
                        className="w-40 rounded-md border border-bordure bg-surface px-2 py-1.5 text-sm text-texte"
                      >
                        <option value="">— Choisir —</option>
                        {comptes.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.nom}
                          </option>
                        ))}
                        <option value={NOUVEAU_COMPTE}>+ Nouveau compte...</option>
                      </select>
                    </label>
                    {form.compte_id === NOUVEAU_COMPTE && (
                      <>
                        <label className="flex flex-col gap-1 text-xs font-medium text-texte-attenue">
                          Nom du nouveau compte
                          <input
                            value={form.compte_nom}
                            onChange={(e) => majForm(h.id, { compte_nom: e.target.value })}
                            aria-label={`Nom du nouveau compte pour ${h.ticker}`}
                            className="w-36 rounded-md border border-bordure bg-surface px-2 py-1.5 text-sm text-texte"
                            placeholder="PEA, CTO..."
                          />
                        </label>
                        <label className="flex flex-col gap-1 text-xs font-medium text-texte-attenue">
                          Établissement
                          <SelecteurEtablissement
                            etablissements={etablissements}
                            value={form.etablissement_id}
                            nomNouveau={form.etablissement_nom}
                            onValueChange={(v) => majForm(h.id, { etablissement_id: v })}
                            onNomNouveauChange={(v) => majForm(h.id, { etablissement_nom: v })}
                            ariaLabel={`Établissement pour ${h.ticker}`}
                            className="w-36 rounded-md border border-bordure bg-surface px-2 py-1.5 text-sm text-texte"
                          />
                        </label>
                      </>
                    )}
                    <button
                      type="button"
                      onClick={() => resoudre(h)}
                      disabled={savingId === h.id || !validable}
                      className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-surface disabled:opacity-40"
                    >
                      Valider
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
          {error && <EtatErreur message={error} />}
          <div className="mt-4 flex justify-end border-t border-bordure pt-4">
            <button
              type="button"
              onClick={continuer}
              disabled={!toutesResolues || finishing}
              className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-surface disabled:opacity-40"
            >
              {finishing ? 'Chargement…' : 'Continuer'}
            </button>
          </div>
        </Card>
      </div>
    </div>
  )
}
