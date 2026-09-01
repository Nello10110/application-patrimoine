import { useState } from 'react'
import { api } from '../api/client'
import type { ScheduledJob } from '../api/types'
import Card from './Card'
import EtatErreur from './EtatErreur'
import { useRafraichissementCours } from '../hooks/useRafraichissementCours'
import { formatDateHeure } from '../utils/format'

const JOB_LABELS: Record<string, string> = {
  market_data_refresh: 'Rafraîchissement des données de marché',
  justetf_refresh: 'Composition géographique/sectorielle (justETF)',
  sauvegarde_chiffree: 'Sauvegarde chiffrée',
}

const JOB_DESCRIPTIONS: Record<string, string> = {
  market_data_refresh: 'Cours, composition des ETF et principales lignes sous-jacentes, pour toutes les positions du portefeuille.',
  justetf_refresh:
    "Répartition pays/secteurs réelle des ETF détenus, récupérée sur justETF.com. Cadence hebdomadaire par défaut : la composition d'un ETF évolue lentement, et justETF n'offre aucun support en cas de blocage.",
  sauvegarde_chiffree:
    "Copie chiffrée de la base, déposée dans backend/sauvegardes/ (rétention des 10 plus récentes). Nécessite la variable d'environnement PATRIMOINE_BACKUP_KEY sur le serveur — sans elle, ce job échoue proprement (visible ci-dessous) sans affecter les autres.",
}

// 168h (une semaine) couvre l'intervalle par défaut de justetf_refresh
// (`scheduler_service.DEFAULTS`) — sans cette option, le sélecteur afficherait une
// valeur ne correspondant à aucune entrée tant que l'utilisateur n'a pas modifié
// l'intervalle une première fois.
const INTERVAL_OPTIONS = [1, 6, 12, 24, 48, 168]

export default function JobCard({ job, onChange }: { job: ScheduledJob; onChange: (job: ScheduledJob) => void }) {
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
      <p className="mb-4 text-sm text-texte">{JOB_DESCRIPTIONS[job.job_key]}</p>

      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm text-texte">
          <input type="checkbox" checked={job.enabled} disabled={saving} onChange={(e) => handleToggle(e.target.checked)} />
          Activé
        </label>

        <label className="flex items-center gap-2 text-sm text-texte">
          Toutes les
          <select
            value={job.intervalle_heures}
            disabled={saving || !job.enabled}
            onChange={(e) => handleIntervalChange(Number(e.target.value))}
            className="rounded-md border border-bordure bg-surface px-2 py-1 text-sm text-texte disabled:opacity-40"
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
          className="ml-auto rounded-md bg-texte px-3 py-1.5 text-xs font-medium text-surface disabled:opacity-40"
        >
          {running ? libelleRunNow : 'Lancer maintenant'}
        </button>
      </div>

      <div className="mt-4 border-t border-bordure pt-3 text-xs text-texte-attenue">
        <p>Dernière exécution : {formatDateHeure(job.derniere_execution)}</p>
        {job.dernier_statut && (
          <p className={job.dernier_statut === 'ok' ? 'text-positif' : 'text-negatif'}>
            {job.dernier_statut === 'ok' ? 'Succès' : 'Échec'} — {job.dernier_message}
          </p>
        )}
      </div>

      {error && <EtatErreur message={error} />}
      {erreurRafraichissement && <EtatErreur message={erreurRafraichissement} />}
    </Card>
  )
}
