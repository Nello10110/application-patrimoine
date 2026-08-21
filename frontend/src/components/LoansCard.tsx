import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { Holding, Loan } from '../api/types'
import { usePreferencesAffichage } from '../hooks/usePreferencesAffichage'
import { formatDateHeure, formatEuro } from '../utils/format'
import Card from './Card'
import EtatErreur from './EtatErreur'
import EtatVide from './EtatVide'
import Modale from './Modale'
import { SkeletonTexte } from './Skeleton'

interface LoanForm {
  libelle: string
  capital_initial: string
  taux_annuel_pct: string
  mensualite: string
  date_debut: string
  duree_mois: string
}

const FORM_VIDE: LoanForm = { libelle: '', capital_initial: '', taux_annuel_pct: '', mensualite: '', date_debut: '', duree_mois: '' }

/** Dettes et emprunts (roadmap Phase 1, patrimoine net) — premier vrai PASSIF de
 * l'application. Carte autonome (charge ses propres données) plutôt qu'un nouvel
 * onglet du tableau des positions : un emprunt n'a ni quantité ni prix, sa forme de
 * données est trop différente d'un `Holding` pour partager le même tableau. Le
 * capital restant dû est toujours calculé côté serveur (`loan_service.py`) — un
 * recalage manuel (relevé bancaire réel) prime sur le calcul théorique. */
export default function LoansCard() {
  const { montantsMasques } = usePreferencesAffichage()
  const [loans, setLoans] = useState<Loan[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [form, setForm] = useState<LoanForm>(FORM_VIDE)
  const [saving, setSaving] = useState(false)

  const [recalageId, setRecalageId] = useState<number | null>(null)
  const [recalageValeur, setRecalageValeur] = useState('')
  const [recalageSaving, setRecalageSaving] = useState(false)

  const [confirmSuppression, setConfirmSuppression] = useState<{ id: number; libelle: string } | null>(null)
  const [suppressionEnCours, setSuppressionEnCours] = useState(false)

  // Rattachement à un actif (backlog 2.M.2), nécessaire au calcul de la part nette
  // par détenteur (2.L.1).
  const [holdings, setHoldings] = useState<Holding[]>([])
  const [rattachementSaving, setRattachementSaving] = useState<number | null>(null)

  function load() {
    setLoading(true)
    api
      .listLoans()
      .then(setLoans)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])
  useEffect(() => {
    api.listHoldings().then(setHoldings).catch(() => setHoldings([]))
  }, [])

  async function handleRattacher(loanId: number, holdingId: number | null) {
    setRattachementSaving(loanId)
    setError(null)
    try {
      await api.updateLoan(loanId, { holding_id: holdingId })
      load()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setRattachementSaving(null)
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!form.libelle.trim() || !form.capital_initial || !form.taux_annuel_pct || !form.mensualite || !form.date_debut || !form.duree_mois)
      return
    setSaving(true)
    setError(null)
    try {
      await api.createLoan({
        libelle: form.libelle.trim(),
        capital_initial: Number(form.capital_initial),
        taux_annuel_pct: Number(form.taux_annuel_pct),
        mensualite: Number(form.mensualite),
        date_debut: form.date_debut,
        duree_mois: Number(form.duree_mois),
      })
      setForm(FORM_VIDE)
      load()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  function startRecalage(loan: Loan) {
    setRecalageId(loan.id)
    setRecalageValeur(String(loan.capital_restant_du))
  }

  async function saveRecalage(id: number) {
    setRecalageSaving(true)
    setError(null)
    try {
      await api.updateLoan(id, { capital_restant_du_manuel: Number(recalageValeur) })
      setRecalageId(null)
      load()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setRecalageSaving(false)
    }
  }

  async function confirmerSuppression() {
    if (!confirmSuppression) return
    setSuppressionEnCours(true)
    try {
      await api.deleteLoan(confirmSuppression.id)
      setConfirmSuppression(null)
      load()
    } catch (err) {
      setError((err as Error).message)
      setConfirmSuppression(null)
    } finally {
      setSuppressionEnCours(false)
    }
  }

  const totalRestantDu = loans.reduce((somme, l) => somme + l.capital_restant_du, 0)

  return (
    <Card title="Dettes et emprunts">
      {error && (
        <div className="mb-3">
          <EtatErreur message={error} onReessayer={load} />
        </div>
      )}

      {loading ? (
        <SkeletonTexte />
      ) : loans.length === 0 ? (
        <EtatVide titre="Aucun emprunt enregistré." description="Renseigne un crédit immobilier ou un prêt dans le formulaire ci-dessous." />
      ) : (
        <div className="mb-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-bordure text-left text-xs font-medium uppercase text-texte-attenue">
                <th className="py-2 pr-4">Libellé</th>
                <th className="py-2 pr-4">Capital initial</th>
                <th className="py-2 pr-4">Taux</th>
                <th className="py-2 pr-4">Mensualité</th>
                <th className="py-2 pr-4">Capital restant dû</th>
                <th className="py-2 pr-4">Actif rattaché</th>
                <th className="py-2 pr-4"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-bordure">
              {loans.map((loan) => (
                <tr key={loan.id}>
                  <td className="py-2 pr-4 font-medium text-texte">{loan.libelle}</td>
                  <td className="py-2 pr-4 text-texte">{formatEuro(loan.capital_initial, 0, montantsMasques)}</td>
                  <td className="py-2 pr-4 text-texte">{loan.taux_annuel_pct.toFixed(2)}%</td>
                  <td className="py-2 pr-4 text-texte">{formatEuro(loan.mensualite, 0, montantsMasques)}</td>
                  <td className="py-2 pr-4">
                    {recalageId === loan.id ? (
                      <div className="flex items-center gap-2">
                        <input
                          value={recalageValeur}
                          onChange={(e) => setRecalageValeur(e.target.value)}
                          type="number"
                          step="any"
                          aria-label={`Recaler le capital restant dû de ${loan.libelle}`}
                          className="w-28 rounded-md border border-bordure bg-surface px-2 py-1 text-sm text-texte"
                        />
                        <button
                          onClick={() => saveRecalage(loan.id)}
                          disabled={recalageSaving}
                          className="text-xs font-medium text-positif hover:underline disabled:opacity-40"
                        >
                          Enregistrer
                        </button>
                        <button onClick={() => setRecalageId(null)} className="text-xs text-texte-attenue hover:underline">
                          Annuler
                        </button>
                      </div>
                    ) : (
                      <div>
                        <span className="font-medium text-texte">{formatEuro(loan.capital_restant_du, 0, montantsMasques)}</span>
                        {loan.derniere_maj_manuelle && (
                          <span className="ml-2 text-xs text-texte-attenue">
                            recalé le {formatDateHeure(loan.derniere_maj_manuelle)}
                          </span>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="py-2 pr-4">
                    <select
                      value={loan.holding_id ?? ''}
                      disabled={rattachementSaving === loan.id}
                      onChange={(e) => handleRattacher(loan.id, e.target.value === '' ? null : Number(e.target.value))}
                      className="rounded-md border border-bordure bg-surface px-2 py-1 text-sm text-texte"
                    >
                      <option value="">Aucun</option>
                      {holdings.map((h) => (
                        <option key={h.id} value={h.id}>
                          {h.nom ?? h.ticker}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2 pr-4 text-right">
                    {recalageId !== loan.id && (
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => startRecalage(loan)} className="text-xs text-texte-attenue hover:underline">
                          Recaler
                        </button>
                        <button
                          onClick={() => setConfirmSuppression({ id: loan.id, libelle: loan.libelle })}
                          className="text-xs text-negatif hover:underline"
                        >
                          Supprimer
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-bordure text-sm font-semibold text-texte">
                <td colSpan={4} className="py-2 pr-4">
                  {loans.length} emprunt{loans.length > 1 ? 's' : ''}
                </td>
                <td className="py-2 pr-4">{formatEuro(totalRestantDu, 0, montantsMasques)}</td>
                <td></td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <form onSubmit={handleAdd} className="flex flex-wrap items-end gap-3 border-t border-bordure pt-4">
        <label className="flex flex-col gap-1 text-xs font-medium text-texte-attenue">
          Libellé
          <input
            value={form.libelle}
            onChange={(e) => setForm({ ...form, libelle: e.target.value })}
            className="w-40 rounded-md border border-bordure bg-surface px-2 py-1.5 text-sm text-texte"
            placeholder="Crédit immobilier"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-texte-attenue">
          Capital initial
          <input
            value={form.capital_initial}
            onChange={(e) => setForm({ ...form, capital_initial: e.target.value })}
            type="number"
            step="any"
            className="w-32 rounded-md border border-bordure bg-surface px-2 py-1.5 text-sm text-texte"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-texte-attenue">
          Taux annuel (%)
          <input
            value={form.taux_annuel_pct}
            onChange={(e) => setForm({ ...form, taux_annuel_pct: e.target.value })}
            type="number"
            step="any"
            className="w-28 rounded-md border border-bordure bg-surface px-2 py-1.5 text-sm text-texte"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-texte-attenue">
          Mensualité
          <input
            value={form.mensualite}
            onChange={(e) => setForm({ ...form, mensualite: e.target.value })}
            type="number"
            step="any"
            className="w-28 rounded-md border border-bordure bg-surface px-2 py-1.5 text-sm text-texte"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-texte-attenue">
          Date de début
          <input
            value={form.date_debut}
            onChange={(e) => setForm({ ...form, date_debut: e.target.value })}
            type="date"
            className="w-36 rounded-md border border-bordure bg-surface px-2 py-1.5 text-sm text-texte"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-texte-attenue">
          Durée (mois)
          <input
            value={form.duree_mois}
            onChange={(e) => setForm({ ...form, duree_mois: e.target.value })}
            type="number"
            step="1"
            className="w-24 rounded-md border border-bordure bg-surface px-2 py-1.5 text-sm text-texte"
          />
        </label>
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-surface disabled:opacity-40"
        >
          Ajouter
        </button>
      </form>
      <p className="mt-3 text-xs text-texte-attenue">
        Le capital restant dû est calculé automatiquement (amortissement à taux fixe) ; « Recaler » permet de le corriger à la
        main d'après un relevé bancaire réel — le recalage prime alors sur le calcul théorique.
      </p>

      {confirmSuppression && (
        <Modale onClose={() => setConfirmSuppression(null)} panelClassName="w-full max-w-sm rounded-xl bg-surface p-6 shadow-xl">
          {({ titleId }) => (
            <>
              <h2 id={titleId} className="text-lg font-semibold text-texte">
                Supprimer cet emprunt ?
              </h2>
              <p className="mt-2 text-sm text-texte">
                L'emprunt <span className="font-medium text-texte">{confirmSuppression.libelle}</span> sera
                définitivement supprimé.
              </p>
              <div className="mt-5 flex justify-end gap-2">
                <button
                  onClick={() => setConfirmSuppression(null)}
                  disabled={suppressionEnCours}
                  className="rounded-md px-4 py-2 text-sm font-medium text-texte-attenue hover:bg-surface-elevee disabled:opacity-40"
                >
                  Annuler
                </button>
                <button
                  onClick={confirmerSuppression}
                  disabled={suppressionEnCours}
                  className="rounded-md bg-negatif px-4 py-2 text-sm font-medium text-surface hover:opacity-90 disabled:opacity-40"
                >
                  {suppressionEnCours ? 'Suppression...' : 'Supprimer'}
                </button>
              </div>
            </>
          )}
        </Modale>
      )}
    </Card>
  )
}
