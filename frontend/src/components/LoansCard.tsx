import { Fragment, useEffect, useState } from 'react'
import { api } from '../api/client'
import type { Holding, Loan } from '../api/types'
import { useEstMobile } from '../hooks/useEstMobile'
import { usePreferencesAffichage } from '../hooks/usePreferencesAffichage'
import { useEditeurQuotites } from '../hooks/useEditeurQuotites'
import { formatDateHeure, formatEuro } from '../utils/format'
import Card from './Card'
import EtatErreur from './EtatErreur'
import EtatVide from './EtatVide'
import type { LoanForm } from './LoanFormFields'
import LoanFormFields from './LoanFormFields'
import Modale from './Modale'
import { SkeletonTexte } from './Skeleton'


/** Répartition d'un emprunt entre détenteurs (backlog 2.L.1/X.1) — câble
 * `PUT /loans/{id}/quotites`, jusqu'ici sans UI (le service existait déjà,
 * `detenteurs_service.set_quotites_loan`, jamais exposé). Volontairement plus
 * simple que `DetenteursSection.tsx` (la fiche d'une position) : pas de « part
 * détenue/nette » affichée ici, l'endpoint emprunt ne renvoie qu'un accusé de
 * réception, contrairement à la fiche détaillée d'un actif. */
function QuotitesEmprunt({ loanId }: { loanId: number }) {
  const { detenteurs, erreurChargement, rechargerDetenteurs, saisie, setValeur, total, totalValide, saving, error, enregistre, handleSave } =
    useEditeurQuotites({ enregistrer: (quotites) => api.setLoanQuotites(loanId, quotites) })

  if (erreurChargement !== null) {
    return (
      <div className="mt-3 border-t border-bordure pt-3">
        <EtatErreur message={`Impossible de charger les détenteurs : ${erreurChargement}`} onReessayer={rechargerDetenteurs} />
      </div>
    )
  }
  if (detenteurs === null) return <SkeletonTexte lignes={1} />
  if (detenteurs.length === 0) return null

  return (
    <div className="mt-3 border-t border-bordure pt-3">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-texte-attenue">Détenteurs de cet emprunt</p>
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
              className="w-20 rounded-md border border-bordure bg-surface px-2 py-1 text-sm text-texte"
            />
          </label>
        ))}
        <button
          type="button"
          onClick={handleSave}
          disabled={!totalValide || saving}
          className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-surface disabled:opacity-40"
        >
          Enregistrer
        </button>
      </div>
      {!totalValide && <p className="mt-1 text-xs text-negatif">Total actuel : {total.toFixed(2)} % (doit faire 100 %)</p>}
      {enregistre && <p className="mt-1 text-xs text-positif">Répartition enregistrée.</p>}
      {error && <p className="mt-1 text-xs text-negatif">{error}</p>}
    </div>
  )
}

const LOAN_FORM_VIDE: LoanForm = {
  libelle: '',
  capital_initial: '',
  taux_annuel_pct: '',
  mensualite: '',
  date_debut: '',
  duree_mois: '',
}

/** Un emprunt, en carte (backlog 2.K.4, < 768 px) — remplace la ligne de tableau
 * sur mobile, même état de recalage/rattachement que la vue desktop. */
function LoanCardMobile({
  loan,
  holdings,
  holdingsIndisponibles,
  montantsMasques,
  recalageId,
  recalageValeur,
  setRecalageValeur,
  recalageSaving,
  rattachementSaving,
  editionId,
  editForm,
  setEditForm,
  editionSaving,
  onStartRecalage,
  onSaveRecalage,
  onCancelRecalage,
  onRattacher,
  onRequestDelete,
  onStartEdition,
  onSaveEdition,
  onCancelEdition,
  detenteursOuverts,
  onToggleDetenteurs,
}: {
  loan: Loan
  holdings: Holding[]
  holdingsIndisponibles: boolean
  montantsMasques: boolean
  recalageId: number | null
  recalageValeur: string
  setRecalageValeur: (v: string) => void
  recalageSaving: boolean
  rattachementSaving: number | null
  editionId: number | null
  editForm: LoanForm
  setEditForm: (f: LoanForm) => void
  editionSaving: boolean
  onStartRecalage: () => void
  onSaveRecalage: () => void
  onCancelRecalage: () => void
  onRattacher: (holdingId: number | null) => void
  onRequestDelete: () => void
  onStartEdition: () => void
  onSaveEdition: () => void
  onCancelEdition: () => void
  detenteursOuverts: boolean
  onToggleDetenteurs: () => void
}) {
  const enRecalage = recalageId === loan.id
  const enEdition = editionId === loan.id

  if (enEdition) {
    return (
      <div className="rounded-lg border border-bordure bg-surface p-4">
        <div className="space-y-3">
          <LoanFormFields
            form={editForm}
            onChange={setEditForm}
            variant="pleineLargeur"
            libelleAriaSuffix={`de ${loan.libelle} (édition)`}
          />
        </div>

        <div className="mt-4 flex gap-2">
          <button
            onClick={onSaveEdition}
            disabled={editionSaving}
            className="min-h-11 flex-1 rounded-md bg-accent px-3 text-sm font-medium text-surface disabled:opacity-40"
          >
            Enregistrer
          </button>
          <button onClick={onCancelEdition} className="min-h-11 flex-1 rounded-md border border-bordure px-3 text-sm font-medium text-texte">
            Annuler
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-bordure bg-surface p-4">
      <p className="font-medium text-texte">{loan.libelle}</p>

      <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
        <div>
          <span className="block text-xs text-texte-attenue">Capital initial</span>
          {formatEuro(loan.capital_initial, 0, montantsMasques)}
        </div>
        <div>
          <span className="block text-xs text-texte-attenue">Taux</span>
          {loan.taux_annuel_pct.toFixed(2)}%
        </div>
        <div>
          <span className="block text-xs text-texte-attenue">Mensualité</span>
          {formatEuro(loan.mensualite, 0, montantsMasques)}
        </div>
        <div>
          <span className="block text-xs text-texte-attenue">Capital restant dû</span>
          <span className="font-medium text-texte">{formatEuro(loan.capital_restant_du, 0, montantsMasques)}</span>
        </div>
      </div>
      {loan.derniere_maj_manuelle && !enRecalage && (
        <p className="mt-1 text-xs text-texte-attenue">recalé le {formatDateHeure(loan.derniere_maj_manuelle)}</p>
      )}

      {enRecalage && (
        <label className="mt-3 flex flex-col gap-1 text-xs font-medium text-texte-attenue">
          Nouveau capital restant dû
          <input
            value={recalageValeur}
            onChange={(e) => setRecalageValeur(e.target.value)}
            type="number"
            step="any"
            aria-label={`Recaler le capital restant dû de ${loan.libelle}`}
            className="w-full rounded-md border border-bordure bg-surface px-3 py-2 text-sm text-texte"
          />
        </label>
      )}

      <label className="mt-3 flex flex-col gap-1 text-xs font-medium text-texte-attenue">
        Actif rattaché
        <select
          value={loan.holding_id ?? ''}
          disabled={rattachementSaving === loan.id || holdingsIndisponibles}
          title={holdingsIndisponibles ? 'Liste des actifs indisponible — rattachement momentanément non modifiable.' : undefined}
          onChange={(e) => onRattacher(e.target.value === '' ? null : Number(e.target.value))}
          className="w-full rounded-md border border-bordure bg-surface px-3 py-2 text-sm text-texte"
        >
          {holdingsIndisponibles && loan.holding_id !== null && <option value={loan.holding_id}>Actif rattaché (liste indisponible)</option>}
          <option value="">Aucun</option>
          {holdings.map((h) => (
            <option key={h.id} value={h.id}>
              {h.nom ?? h.ticker}
            </option>
          ))}
        </select>
      </label>

      {detenteursOuverts && <QuotitesEmprunt loanId={loan.id} />}

      <div className="mt-4 flex gap-2">
        {enRecalage ? (
          <>
            <button
              onClick={onSaveRecalage}
              disabled={recalageSaving}
              className="min-h-11 flex-1 rounded-md bg-accent px-3 text-sm font-medium text-surface disabled:opacity-40"
            >
              Enregistrer
            </button>
            <button onClick={onCancelRecalage} className="min-h-11 flex-1 rounded-md border border-bordure px-3 text-sm font-medium text-texte">
              Annuler
            </button>
          </>
        ) : (
          <>
            <button onClick={onStartEdition} className="min-h-11 flex-1 rounded-md border border-bordure px-3 text-sm font-medium text-texte">
              Modifier
            </button>
            <button onClick={onStartRecalage} className="min-h-11 flex-1 rounded-md border border-bordure px-3 text-sm font-medium text-texte">
              Recaler
            </button>
            <button onClick={onToggleDetenteurs} className="min-h-11 flex-1 rounded-md border border-bordure px-3 text-sm font-medium text-texte">
              {detenteursOuverts ? 'Fermer' : 'Détenteurs'}
            </button>
            <button
              onClick={onRequestDelete}
              className="min-h-11 flex-1 rounded-md border border-negatif/40 px-3 text-sm font-medium text-negatif"
            >
              Supprimer
            </button>
          </>
        )}
      </div>
    </div>
  )
}

/** Dettes et emprunts (roadmap Phase 1, patrimoine net) — premier vrai PASSIF de
 * l'application. Carte autonome (charge ses propres données) plutôt qu'un nouvel
 * onglet du tableau des positions : un emprunt n'a ni quantité ni prix, sa forme de
 * données est trop différente d'un `Holding` pour partager le même tableau. Le
 * capital restant dû est toujours calculé côté serveur (`loan_service.py`) — un
 * recalage manuel (relevé bancaire réel) prime sur le calcul théorique. */
export default function LoansCard() {
  const { montantsMasques } = usePreferencesAffichage()
  const estMobile = useEstMobile()
  const [loans, setLoans] = useState<Loan[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [form, setForm] = useState<LoanForm>(LOAN_FORM_VIDE)
  const [saving, setSaving] = useState(false)

  const [recalageId, setRecalageId] = useState<number | null>(null)
  const [recalageValeur, setRecalageValeur] = useState('')
  const [recalageSaving, setRecalageSaving] = useState(false)

  // Édition complète d'un emprunt (backlog quickwin § T.1, retour utilisateur
  // 30/08/2026) : `capital_restant_du_manuel` reste hors de ce formulaire — il
  // garde sa sémantique propre via « Recaler » (relevé bancaire réel qui prime sur
  // le calcul théorique), les deux actions ne se recouvrent jamais sur une même
  // ligne (`startEdition`/`startRecalage` s'excluent mutuellement ci-dessous).
  const [editionId, setEditionId] = useState<number | null>(null)
  const [editForm, setEditForm] = useState<LoanForm>(LOAN_FORM_VIDE)
  const [editionSaving, setEditionSaving] = useState(false)

  const [confirmSuppression, setConfirmSuppression] = useState<{ id: number; libelle: string } | null>(null)
  const [suppressionEnCours, setSuppressionEnCours] = useState(false)

  // Répartition entre détenteurs (backlog 2.L.1/X.1) — un seul emprunt déplié à la
  // fois, même pattern que `recalageId`/`editionId` ci-dessus.
  const [detenteursOuvertId, setDetenteursOuvertId] = useState<number | null>(null)

  // Rattachement à un actif (backlog 2.M.2), nécessaire au calcul de la part nette
  // par détenteur (2.L.1).
  const [holdings, setHoldings] = useState<Holding[]>([])
  const [holdingsIndisponibles, setHoldingsIndisponibles] = useState(false)
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
    // `null` ≠ `[]` : sur échec, le sélecteur « Actif rattaché » affichait « Aucun »
    // pour un emprunt POURTANT rattaché (l'option correspondante manquait, la
    // `value` ne matchait plus). Un affichage faux, sans le moindre indice pour
    // l'utilisateur (revue du 03/09/2026). On distingue donc l'échec du vide.
    api
      .listHoldings()
      .then(setHoldings)
      .catch(() => setHoldingsIndisponibles(true))
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
      setForm(LOAN_FORM_VIDE)
      load()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  function startRecalage(loan: Loan) {
    setEditionId(null)
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

  function startEdition(loan: Loan) {
    setRecalageId(null)
    setEditionId(loan.id)
    setEditForm({
      libelle: loan.libelle,
      capital_initial: String(loan.capital_initial),
      taux_annuel_pct: String(loan.taux_annuel_pct),
      mensualite: String(loan.mensualite),
      date_debut: loan.date_debut.slice(0, 10),
      duree_mois: String(loan.duree_mois),
    })
  }

  function cancelEdition() {
    setEditionId(null)
  }

  async function saveEdition(id: number) {
    if (
      !editForm.libelle.trim() ||
      !editForm.capital_initial ||
      !editForm.taux_annuel_pct ||
      !editForm.mensualite ||
      !editForm.date_debut ||
      !editForm.duree_mois
    )
      return
    setEditionSaving(true)
    setError(null)
    try {
      await api.updateLoan(id, {
        libelle: editForm.libelle.trim(),
        capital_initial: Number(editForm.capital_initial),
        taux_annuel_pct: Number(editForm.taux_annuel_pct),
        mensualite: Number(editForm.mensualite),
        date_debut: editForm.date_debut,
        duree_mois: Number(editForm.duree_mois),
      })
      setEditionId(null)
      load()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setEditionSaving(false)
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
      ) : estMobile ? (
        <div className="mb-4 space-y-3">
          {loans.map((loan) => (
            <LoanCardMobile
              key={loan.id}
              loan={loan}
              holdings={holdings}
              holdingsIndisponibles={holdingsIndisponibles}
              montantsMasques={montantsMasques}
              recalageId={recalageId}
              recalageValeur={recalageValeur}
              setRecalageValeur={setRecalageValeur}
              recalageSaving={recalageSaving}
              rattachementSaving={rattachementSaving}
              editionId={editionId}
              editForm={editForm}
              setEditForm={setEditForm}
              editionSaving={editionSaving}
              onStartRecalage={() => startRecalage(loan)}
              onSaveRecalage={() => saveRecalage(loan.id)}
              onCancelRecalage={() => setRecalageId(null)}
              onRattacher={(holdingId) => handleRattacher(loan.id, holdingId)}
              onRequestDelete={() => setConfirmSuppression({ id: loan.id, libelle: loan.libelle })}
              onStartEdition={() => startEdition(loan)}
              onSaveEdition={() => saveEdition(loan.id)}
              onCancelEdition={cancelEdition}
              detenteursOuverts={detenteursOuvertId === loan.id}
              onToggleDetenteurs={() => setDetenteursOuvertId((id) => (id === loan.id ? null : loan.id))}
            />
          ))}
          <p className="pt-1 text-sm font-semibold text-texte">
            {loans.length} emprunt{loans.length > 1 ? 's' : ''} · {formatEuro(totalRestantDu, 0, montantsMasques)}
          </p>
        </div>
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
                <th className="py-2 pr-4">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-bordure">
              {loans.map((loan) => (
                <Fragment key={loan.id}>
                <tr>
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
                      disabled={rattachementSaving === loan.id || holdingsIndisponibles}
                      title={holdingsIndisponibles ? 'Liste des actifs indisponible — rattachement momentanément non modifiable.' : undefined}
                      onChange={(e) => handleRattacher(loan.id, e.target.value === '' ? null : Number(e.target.value))}
                      className="rounded-md border border-bordure bg-surface px-2 py-1 text-sm text-texte"
                    >
                      {/* Sans cette option, un emprunt rattaché retombait sur
                          « Aucun » quand la liste n'avait pas pu être chargée. */}
                      {holdingsIndisponibles && loan.holding_id !== null && <option value={loan.holding_id}>Actif rattaché (liste indisponible)</option>}
                      <option value="">Aucun</option>
                      {holdings.map((h) => (
                        <option key={h.id} value={h.id}>
                          {h.nom ?? h.ticker}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2 pr-4 text-right">
                    {recalageId !== loan.id && editionId !== loan.id && (
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => startEdition(loan)} className="text-xs text-texte-attenue hover:underline">
                          Modifier
                        </button>
                        <button onClick={() => startRecalage(loan)} className="text-xs text-texte-attenue hover:underline">
                          Recaler
                        </button>
                        <button
                          onClick={() => setDetenteursOuvertId((id) => (id === loan.id ? null : loan.id))}
                          className="text-xs text-texte-attenue hover:underline"
                        >
                          {detenteursOuvertId === loan.id ? 'Fermer' : 'Détenteurs'}
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
                {editionId === loan.id && (
                  <tr key={`${loan.id}-edition`}>
                    <td colSpan={7} className="bg-surface-elevee py-3 pr-4">
                      <div className="flex flex-wrap items-end gap-3">
                        <LoanFormFields
                          form={editForm}
                          onChange={setEditForm}
                          variant="compacte"
                          libelleAriaSuffix={`de ${loan.libelle} (édition)`}
                        />
                        <button
                          onClick={() => saveEdition(loan.id)}
                          disabled={editionSaving}
                          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-surface disabled:opacity-40"
                        >
                          Enregistrer
                        </button>
                        <button
                          onClick={cancelEdition}
                          className="rounded-md border border-bordure px-4 py-2 text-sm font-medium text-texte"
                        >
                          Annuler
                        </button>
                      </div>
                    </td>
                  </tr>
                )}
                {detenteursOuvertId === loan.id && (
                  <tr key={`${loan.id}-detenteurs`}>
                    <td colSpan={7} className="bg-surface-elevee py-3 pr-4">
                      <QuotitesEmprunt loanId={loan.id} />
                    </td>
                  </tr>
                )}
              </Fragment>
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
        <LoanFormFields form={form} onChange={setForm} variant="compacte" />
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
