import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { Preferences, ScheduledJob } from '../api/types'
import Card from '../components/Card'
import { useRafraichissementCours } from '../hooks/useRafraichissementCours'
import { formatDateHeure } from '../utils/format'

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

function PreferencesCard() {
  const [prefs, setPrefs] = useState<Preferences | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    api
      .getPreferences()
      .then(setPrefs)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  async function handleMethodeChange(methode_cout: Preferences['methode_cout']) {
    if (!prefs) return
    setSaving(true)
    setError(null)
    setMessage(null)
    try {
      const resultat = await api.updatePreferences({ methode_cout, seuil_alerte_ecart_pct: prefs.seuil_alerte_ecart_pct })
      setPrefs({ methode_cout: resultat.methode_cout, seuil_alerte_ecart_pct: resultat.seuil_alerte_ecart_pct })
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

  async function handleSeuilChange(seuil_alerte_ecart_pct: number) {
    if (!prefs) return
    setSaving(true)
    setError(null)
    try {
      const resultat = await api.updatePreferences({ methode_cout: prefs.methode_cout, seuil_alerte_ecart_pct })
      setPrefs({ methode_cout: resultat.methode_cout, seuil_alerte_ecart_pct: resultat.seuil_alerte_ecart_pct })
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <p className="text-sm text-slate-500">Chargement...</p>
  if (!prefs) return error ? <p className="text-sm text-red-600">{error}</p> : null

  return (
    <>
      <Card title="Méthode de calcul du coût de revient">
        <p className="mb-4 text-sm text-amber-700">
          Attention : changer de méthode recalcule immédiatement le prix de revient et les gains réalisés de TOUT le
          portefeuille.
        </p>
        <div className="space-y-3">
          {METHODE_OPTIONS.map((option) => (
            <label key={option.value} className="flex cursor-pointer items-start gap-3 rounded-md border border-slate-200 p-3">
              <input
                type="radio"
                name="methode_cout"
                checked={prefs.methode_cout === option.value}
                disabled={saving}
                onChange={() => handleMethodeChange(option.value)}
                className="mt-1"
              />
              <span>
                <span className="block text-sm font-medium text-slate-900">{option.label}</span>
                <span className="block text-xs text-slate-500">{option.description}</span>
              </span>
            </label>
          ))}
        </div>
        {message && <p className="mt-3 text-sm text-emerald-600">{message}</p>}
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </Card>

      <Card title="Alertes">
        <p className="mb-4 text-sm text-slate-600">
          Seuil d'écart (en points de pourcentage) entre la répartition réelle et l'objectif au-delà duquel une
          recommandation de rééquilibrage devient une alerte, mise en avant sur le tableau de bord.
        </p>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          Seuil d'alerte
          <input
            type="number"
            min={0}
            max={100}
            step="0.5"
            defaultValue={prefs.seuil_alerte_ecart_pct}
            disabled={saving}
            onBlur={(e) => {
              const valeur = Number(e.target.value)
              if (!Number.isNaN(valeur) && valeur !== prefs.seuil_alerte_ecart_pct) handleSeuilChange(valeur)
            }}
            className="w-24 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          />
          points
        </label>
      </Card>
    </>
  )
}

const JOB_LABELS: Record<string, string> = {
  market_data_refresh: 'Rafraîchissement des données de marché',
}

const JOB_DESCRIPTIONS: Record<string, string> = {
  market_data_refresh: 'Cours, composition des ETF et principales lignes sous-jacentes, pour toutes les positions du portefeuille.',
}

const INTERVAL_OPTIONS = [1, 6, 12, 24, 48]

function JobCard({ job, onChange }: { job: ScheduledJob; onChange: (job: ScheduledJob) => void }) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // "Lancer maintenant" déclenche le même exécuteur en tâche de fond que le bouton
  // "Rafraîchir les cours" du Portefeuille (LOT 4B, cf. `scheduler_service.run_job_now`)
  // — même hook de sondage. `run-now` renvoie la config *avant* exécution puisqu'il
  // ne bloque plus la requête : une fois le rafraîchissement terminé, on recharge
  // la liste des jobs pour obtenir "Dernière exécution"/le statut à jour.
  const {
    etat: etatRafraichissement,
    enCours: running,
    erreur: erreurRafraichissement,
    declencher,
  } = useRafraichissementCours(async () => {
    try {
      const jobs = await api.listJobs()
      const miseAJour = jobs.find((j) => j.job_key === job.job_key)
      if (miseAJour) onChange(miseAJour)
    } catch (err) {
      setError((err as Error).message)
    }
  })

  async function handleToggle(enabled: boolean) {
    setSaving(true)
    setError(null)
    try {
      onChange(await api.updateJob(job.job_key, { enabled, intervalle_heures: job.intervalle_heures }))
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function handleIntervalChange(intervalle_heures: number) {
    setSaving(true)
    setError(null)
    try {
      onChange(await api.updateJob(job.job_key, { enabled: job.enabled, intervalle_heures }))
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  function handleRunNow() {
    setError(null)
    declencher(() => api.runJobNow(job.job_key))
  }

  const libelleRunNow =
    etatRafraichissement?.en_cours && etatRafraichissement.positions_total > 0
      ? `Exécution... (${etatRafraichissement.positions_traitees} / ${etatRafraichissement.positions_total} positions)`
      : 'Exécution...'

  return (
    <Card title={JOB_LABELS[job.job_key] ?? job.job_key}>
      <p className="mb-4 text-sm text-slate-600">{JOB_DESCRIPTIONS[job.job_key]}</p>

      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={job.enabled} disabled={saving} onChange={(e) => handleToggle(e.target.checked)} />
          Activé
        </label>

        <label className="flex items-center gap-2 text-sm text-slate-700">
          Toutes les
          <select
            value={job.intervalle_heures}
            disabled={saving || !job.enabled}
            onChange={(e) => handleIntervalChange(Number(e.target.value))}
            className="rounded-md border border-slate-300 px-2 py-1 text-sm disabled:opacity-40"
          >
            {INTERVAL_OPTIONS.map((h) => (
              <option key={h} value={h}>
                {h}h
              </option>
            ))}
          </select>
        </label>

        <button
          onClick={handleRunNow}
          disabled={running}
          className="ml-auto rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
        >
          {running ? libelleRunNow : 'Lancer maintenant'}
        </button>
      </div>

      <div className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-500">
        <p>Dernière exécution : {formatDateHeure(job.derniere_execution)}</p>
        {job.dernier_statut && (
          <p className={job.dernier_statut === 'ok' ? 'text-emerald-600' : 'text-red-600'}>
            {job.dernier_statut === 'ok' ? 'Succès' : 'Échec'} — {job.dernier_message}
          </p>
        )}
      </div>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      {erreurRafraichissement && <p className="mt-2 text-sm text-red-600">{erreurRafraichissement}</p>}
    </Card>
  )
}

export default function ReglagesPage() {
  const [jobs, setJobs] = useState<ScheduledJob[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .listJobs()
      .then(setJobs)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  function updateJobInState(updated: ScheduledJob) {
    setJobs((prev) => prev.map((j) => (j.job_key === updated.job_key ? updated : j)))
  }

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-slate-900">Réglages</h2>

      {loading && <p className="text-sm text-slate-500">Chargement...</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="space-y-4">
        <PreferencesCard />
      </div>

      <div className="space-y-4">
        {jobs.map((job) => (
          <JobCard key={job.job_key} job={job} onChange={updateJobInState} />
        ))}
      </div>

      <Card title="Exporter">
        <p className="mb-4 text-sm text-slate-600">
          Fichiers CSV compatibles Excel (séparateur point-virgule, décimale virgule), téléchargés directement par le
          navigateur.
        </p>
        <div className="flex flex-wrap gap-3">
          <a
            href="/api/export/positions"
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white"
          >
            Positions
          </a>
          <a
            href="/api/export/transactions"
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white"
          >
            Transactions
          </a>
          <a
            href="/api/export/performance"
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white"
          >
            Rentabilité
          </a>
        </div>
      </Card>
    </div>
  )
}
