import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { Detenteur, Holding, Loan } from '../api/types'
import EtatErreur from './EtatErreur'
import { IconFermer } from './icons'
import Modale from './Modale'
import { SkeletonTexte } from './Skeleton'

/** Déclaration de patrimoine PDF paramétrable (backlog 2.Q.2) : sélection actif par
 * actif et emprunt par emprunt, filtrage par détenteur, destinataire, et reprise du
 * profil (revenus/dépenses/taux d'imposition — réglé dans Réglages) pour le taux
 * d'endettement et le reste à vivre attendus par un prêteur. */
export default function DeclarationPatrimoineModal({ onClose }: { onClose: () => void }) {
  const [holdings, setHoldings] = useState<Holding[]>([])
  const [loans, setLoans] = useState<Loan[]>([])
  const [detenteurs, setDetenteurs] = useState<Detenteur[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [holdingIds, setHoldingIds] = useState<Set<number>>(new Set())
  const [loanIds, setLoanIds] = useState<Set<number>>(new Set())
  const [detenteurId, setDetenteurId] = useState('')
  const [destinataire, setDestinataire] = useState('')
  const [inclureProfil, setInclureProfil] = useState(false)

  const [generating, setGenerating] = useState(false)
  const [erreurGeneration, setErreurGeneration] = useState<string | null>(null)

  function charger() {
    setLoading(true)
    setError(null)
    Promise.all([api.listHoldings(), api.listLoans(), api.listDetenteurs()])
      .then(([h, l, d]) => {
        setHoldings(h)
        setLoans(l)
        setDetenteurs(d)
        setHoldingIds(new Set(h.map((x) => x.id)))
        setLoanIds(new Set(l.map((x) => x.id)))
      })
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false))
  }

  useEffect(charger, [])

  function toggleHolding(id: number) {
    setHoldingIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleLoan(id: number) {
    setLoanIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleGenerer() {
    setGenerating(true)
    setErreurGeneration(null)
    try {
      const blob = await api.downloadDeclarationPatrimoine({
        holding_ids: Array.from(holdingIds),
        loan_ids: Array.from(loanIds),
        detenteur_id: detenteurId ? Number(detenteurId) : null,
        destinataire: destinataire.trim() || null,
        inclure_profil: inclureProfil,
      })
      const url = URL.createObjectURL(blob)
      const lien = document.createElement('a')
      lien.href = url
      lien.download = `declaration-patrimoine-${new Date().toISOString().slice(0, 10)}.pdf`
      document.body.appendChild(lien)
      lien.click()
      lien.remove()
      URL.revokeObjectURL(url)
      onClose()
    } catch (err) {
      setErreurGeneration((err as Error).message)
    } finally {
      setGenerating(false)
    }
  }

  return (
    <Modale onClose={onClose} panelClassName="w-full max-w-xl rounded-xl bg-surface p-6 shadow-xl">
      {({ titleId }) => (
        <>
          <div className="mb-4 flex items-start justify-between">
            <h3 id={titleId} className="text-lg font-semibold text-texte">
              Déclaration de patrimoine
            </h3>
            <button onClick={onClose} aria-label="Fermer" className="text-texte-attenue hover:text-texte">
              <IconFermer className="h-4 w-4" />
            </button>
          </div>

          {loading && <SkeletonTexte lignes={5} />}
          {error && <EtatErreur message={error} onReessayer={charger} />}

          {!loading && !error && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-3">
                <label className="flex flex-col gap-1 text-xs font-medium text-texte-attenue">
                  Destinataire (optionnel)
                  <input
                    value={destinataire}
                    onChange={(e) => setDestinataire(e.target.value)}
                    placeholder="Banque XYZ"
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
              </div>
              {detenteurId && (
                <p className="text-xs text-texte-attenue">
                  Seuls les actifs et emprunts avec une quotité attribuée à ce détenteur apparaîtront dans le document.
                </p>
              )}

              <label className="flex items-center gap-1.5 text-sm text-texte">
                <input type="checkbox" checked={inclureProfil} onChange={(e) => setInclureProfil(e.target.checked)} />
                Inclure le profil emprunteur (revenus, dépenses, taux d'endettement, reste à vivre, taux d'imposition)
              </label>

              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-texte-attenue">Actifs à inclure</p>
                {holdings.length === 0 ? (
                  <p className="text-sm text-texte-attenue">Aucun actif dans le portefeuille.</p>
                ) : (
                  <ul className="max-h-40 divide-y divide-bordure overflow-y-auto rounded-md border border-bordure">
                    {holdings.map((h) => (
                      <li key={h.id} className="flex items-center justify-between px-2 py-1.5 text-sm">
                        <label className="flex items-center gap-2">
                          <input type="checkbox" checked={holdingIds.has(h.id)} onChange={() => toggleHolding(h.id)} />
                          <span className="text-texte">{h.nom || h.ticker}</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-texte-attenue">Emprunts à inclure</p>
                {loans.length === 0 ? (
                  <p className="text-sm text-texte-attenue">Aucun emprunt enregistré.</p>
                ) : (
                  <ul className="max-h-32 divide-y divide-bordure overflow-y-auto rounded-md border border-bordure">
                    {loans.map((l) => (
                      <li key={l.id} className="flex items-center justify-between px-2 py-1.5 text-sm">
                        <label className="flex items-center gap-2">
                          <input type="checkbox" checked={loanIds.has(l.id)} onChange={() => toggleLoan(l.id)} />
                          <span className="text-texte">{l.libelle}</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {erreurGeneration && <p className="text-sm text-negatif">{erreurGeneration}</p>}

              <div className="flex justify-end gap-3 border-t border-bordure pt-4">
                <button onClick={onClose} className="rounded-md border border-bordure px-4 py-2 text-sm font-medium text-texte">
                  Annuler
                </button>
                <button
                  onClick={handleGenerer}
                  disabled={generating}
                  className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-surface disabled:opacity-40"
                >
                  {generating ? 'Génération...' : 'Générer le PDF'}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </Modale>
  )
}
