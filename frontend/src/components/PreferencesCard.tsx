import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { Preferences } from '../api/types'
import Card from './Card'
import EtatErreur from './EtatErreur'
import { SkeletonTexte } from './Skeleton'

const METHODE_OPTIONS: { value: Preferences['methode_cout']; label: string; description: string }[] = [
  {
    value: 'cout_moyen_pondere',
    label: 'Coût moyen pondéré',
    description: "Chaque vente retire le coût moyen de TOUTE la position au moment de la vente : le prix de revient reste une moyenne unique, quelle que soit l'ancienneté des titres vendus. Méthode par défaut de l'application.",
  },
  {
    value: 'fifo',
    label: 'FIFO (premier entré, premier sorti)',
    description: "Chaque vente consomme d'abord les titres achetés les plus anciens : le coût retiré est celui de ces titres-là, pas une moyenne. Le prix de revient restant ne reflète alors que les lots les plus récents.",
  },
]

export default function PreferencesCard() {
  const [prefs, setPrefs] = useState<Preferences | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  function chargerPreferences() {
    setLoading(true)
    setError(null)
    api
      .getPreferences()
      .then(setPrefs)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(chargerPreferences, [])

  async function handleMethodeChange(methode_cout: Preferences['methode_cout']) {
    if (!prefs) return
    setSaving(true)
    setError(null)
    setMessage(null)
    try {
      const resultat = await api.updatePreferences({
        methode_cout,
        taux_imposition_pct: prefs.taux_imposition_pct,
      })
      setPrefs(resultat)
      if (resultat.positions_recalculees !== null) {
        setMessage(
          `${resultat.positions_recalculees} position${resultat.positions_recalculees > 1 ? 's' : ''} du portefeuille recalculée${
            resultat.positions_recalculees > 1 ? 's' : ''
          } avec la nouvelle méthode.`,
        )
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function handleTauxImpositionChange(taux_imposition_pct: number | null) {
    if (!prefs) return
    setSaving(true)
    setError(null)
    try {
      const resultat = await api.updatePreferences({
        methode_cout: prefs.methode_cout,
        taux_imposition_pct,
      })
      setPrefs(resultat)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <SkeletonTexte />
  if (!prefs) return error ? <EtatErreur message={error} onReessayer={chargerPreferences} /> : null

  return (
    <>
      <Card title="Méthode de calcul du coût de revient">
        <p className="mb-4 text-sm text-avertissement">
          Attention : changer de méthode recalcule immédiatement le prix de revient et les gains réalisés de TOUT le
          portefeuille.
        </p>
        <div className="space-y-3">
          {METHODE_OPTIONS.map((option) => (
            <label
              key={option.value}
              className="flex cursor-pointer items-start gap-3 rounded-md border border-bordure p-3"
            >
              <input
                type="radio"
                name="methode_cout"
                checked={prefs.methode_cout === option.value}
                disabled={saving}
                onChange={() => handleMethodeChange(option.value)}
                className="mt-1"
              />
              <span>
                <span className="block text-sm font-medium text-texte">{option.label}</span>
                <span className="block text-xs text-texte-attenue">{option.description}</span>
              </span>
            </label>
          ))}
        </div>
        {message && <p className="mt-3 text-sm text-positif">{message}</p>}
        {error && <EtatErreur message={error} />}
      </Card>

      <Card title="Déclaration de patrimoine">
        <p className="mb-4 text-sm text-texte">
          Taux d'imposition saisi ici, repris tel quel dans la déclaration de patrimoine (onglet Exporter) — l'application ne
          réalise aucun calcul fiscal, cette valeur est celle que tu renseignes.
        </p>
        <label className="flex items-center gap-2 text-sm text-texte">
          Taux d'imposition
          <input
            type="number"
            min={0}
            max={100}
            step="0.5"
            defaultValue={prefs.taux_imposition_pct ?? ''}
            disabled={saving}
            placeholder="non renseigné"
            onBlur={(e) => {
              const brut = e.target.value.trim()
              const valeur = brut === '' ? null : Number(brut)
              if (valeur === null || !Number.isNaN(valeur)) {
                if (valeur !== prefs.taux_imposition_pct) handleTauxImpositionChange(valeur)
              }
            }}
            className="w-24 rounded-md border border-bordure bg-surface px-2 py-1.5 text-sm text-texte"
          />
          %
        </label>
      </Card>
    </>
  )
}
