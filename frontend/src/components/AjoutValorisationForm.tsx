import { useState } from 'react'
import { api } from '../api/client'
import type { Holding, ValuationHistoryPoint } from '../api/types'
import ChampDecomposition from './ChampDecomposition'
import { PrimaryButton } from './Controls'
import { Field, Input } from './Field'
import { usePreferencesAffichage } from '../hooks/usePreferencesAffichage'
import type { ModeDecomposition } from '../utils/valorisationDecomposition'
import { versementDepuisDecomposition } from '../utils/valorisationDecomposition'
import { dateVersISO } from '../utils/format'

/** Formulaire d'ajout rapide d'un point d'historique à une date choisie par
 * l'utilisateur (backlog 2.S.1) — jamais `datetime.now()` imposé côté serveur pour
 * cette route, contrairement à la création/édition classique d'une ligne. Partagé
 * avec `LigneEpargne` (action rapide « Ajouter une valorisation » sur chaque ligne
 * d'épargne, dans la fiche détaillée d'un compte). */
export function AjoutValorisationForm({
  ticker,
  historique,
  onAdded,
}: {
  ticker: string
  historique: ValuationHistoryPoint[]
  onAdded: (holding: Holding) => void
}) {
  const { montantsMasques } = usePreferencesAffichage()
  const [valeur, setValeur] = useState('')
  const [date, setDate] = useState(() => dateVersISO(new Date()))
  const [mode, setMode] = useState<ModeDecomposition>('versement')
  const [montant, setMontant] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // `historique` est trié chronologiquement (croissant) par le backend : le dernier
  // point est le plus récent, celui dont ce nouveau point marque l'évolution.
  const valeurPrecedente = historique.length > 0 ? historique[historique.length - 1].valeur : null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!valeur) return
    setSaving(true)
    setError(null)
    try {
      const holding = await api.setHoldingValorisation(ticker, {
        valeur: Number(valeur),
        date,
        versement: versementDepuisDecomposition(mode, montant, valeur, valeurPrecedente),
      })
      setValeur('')
      setMontant('')
      onAdded(holding)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
      <Field label="Valeur (€)" className="w-32">
        <Input type="number" step="any" min={0} required value={valeur} onChange={(e) => setValeur(e.target.value)} />
      </Field>
      <Field label="Date" className="w-40">
        <Input type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <ChampDecomposition
        mode={mode}
        onModeChange={setMode}
        montant={montant}
        onMontantChange={setMontant}
        valeur={valeur}
        valeurPrecedente={valeurPrecedente}
        montantsMasques={montantsMasques}
        libelleVersement="Dont versement (€)"
        libellePlusValue="Dont plus-value (€)"
      />
      <PrimaryButton type="submit" disabled={saving}>
        {saving ? 'Enregistrement...' : 'Ajouter une valorisation'}
      </PrimaryButton>
      {error && <span className="text-sm text-negatif">{error}</span>}
      <p className="w-full text-xs text-ink3">
        Versement ou plus-value, au choix — l'autre se déduit automatiquement de l'évolution depuis le point précédent. Laisser
        vide si vous ne savez pas : l'écran Rapport continuera d'estimer le gain via le taux déclaré.
      </p>
    </form>
  )
}
