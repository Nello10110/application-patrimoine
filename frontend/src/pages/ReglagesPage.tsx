import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { AccessLogEntry, Detenteur, HouseholdMember, Preferences, Role, ScheduledJob, Session, TypeDetenteur } from '../api/types'
import Card from '../components/Card'
import EtatErreur from '../components/EtatErreur'
import EtatVide from '../components/EtatVide'
import { SkeletonTexte } from '../components/Skeleton'
import { useRafraichissementCours } from '../hooks/useRafraichissementCours'
import { formatDateHeure } from '../utils/format'

/** Personnes et sociétés du foyer (backlog 2.L.1) : déclarées une fois ici,
 * réutilisées ensuite pour répartir la propriété des actifs (quotités, sur la
 * fiche détaillée de chaque position) et filtrer le patrimoine par détenteur
 * (barre de contrôles). */
function DetenteursCard() {
  const [detenteurs, setDetenteurs] = useState<Detenteur[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [nom, setNom] = useState('')
  const [type, setType] = useState<TypeDetenteur>('personne')
  const [saving, setSaving] = useState(false)

  function load() {
    setLoading(true)
    api
      .listDetenteurs()
      .then(setDetenteurs)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!nom.trim()) return
    setSaving(true)
    setError(null)
    try {
      await api.createDetenteur(nom.trim(), type)
      setNom('')
      load()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: number) {
    setError(null)
    try {
      await api.deleteDetenteur(id)
      load()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <Card title="Personnes et sociétés">
      <p className="mb-4 text-sm text-texte">
        Déclarées une fois, réutilisées pour répartir la propriété des actifs et des emprunts (quotités, depuis la fiche
        détaillée de chaque position) et filtrer le patrimoine par détenteur (barre de contrôles, en haut de l'écran).
      </p>

      {loading ? (
        <SkeletonTexte />
      ) : detenteurs.length === 0 ? (
        <EtatVide titre="Aucun détenteur déclaré." />
      ) : (
        <ul className="mb-4 divide-y divide-bordure">
          {detenteurs.map((d) => (
            <li key={d.id} className="flex items-center justify-between py-2 text-sm">
              <span className="text-texte">
                {d.nom} <span className="text-xs text-texte-attenue">({d.type === 'personne' ? 'Personne' : 'Société'})</span>
              </span>
              <button onClick={() => handleDelete(d.id)} className="text-xs text-negatif hover:underline">
                Supprimer
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={handleAdd} className="flex flex-wrap items-end gap-3 border-t border-bordure pt-4">
        <label className="flex flex-col gap-1 text-xs font-medium text-texte-attenue">
          Nom
          <input
            value={nom}
            onChange={(e) => setNom(e.target.value)}
            placeholder="Alice"
            className="w-40 rounded-md border border-bordure bg-surface px-2 py-1.5 text-sm text-texte"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-texte-attenue">
          Type
          <select
            value={type}
            onChange={(e) => setType(e.target.value as TypeDetenteur)}
            className="rounded-md border border-bordure bg-surface px-2 py-1.5 text-sm text-texte"
          >
            <option value="personne">Personne</option>
            <option value="societe">Société</option>
          </select>
        </label>
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-surface disabled:opacity-40"
        >
          Ajouter
        </button>
      </form>
      {error && <EtatErreur message={error} />}
    </Card>
  )
}

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

  if (loading) return <SkeletonTexte />
  if (!prefs) return error ? <EtatErreur message={error} /> : null

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

      <Card title="Alertes">
        <p className="mb-4 text-sm text-texte">
          Seuil d'écart (en points de pourcentage) entre la répartition réelle et l'objectif au-delà duquel une
          recommandation de rééquilibrage devient une alerte, mise en avant sur le tableau de bord.
        </p>
        <label className="flex items-center gap-2 text-sm text-texte">
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
            className="w-24 rounded-md border border-bordure bg-surface px-2 py-1.5 text-sm text-texte"
          />
          points
        </label>
      </Card>
    </>
  )
}

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

/** Sessions actives du compte (backlog 2.L.2) : liste tous les jetons valides (un
 * par appareil/navigateur connecté), révocables individuellement — jamais "tout
 * déconnecter" en un clic, pour ne pas se déconnecter soi-même par erreur en
 * révoquant la session courante (bouton désactivé sur cette ligne). */
function SessionsCard() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  function load() {
    setLoading(true)
    api
      .listSessions()
      .then(setSessions)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  async function handleRevoke(idSession: string) {
    setError(null)
    try {
      await api.revokeSession(idSession)
      load()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <Card title="Sessions actives">
      <p className="mb-4 text-sm text-texte-attenue">
        Un appareil ou navigateur connecté par ligne. Révoquer une session déconnecte immédiatement cet appareil, sans
        toucher aux autres.
      </p>
      {loading ? (
        <SkeletonTexte />
      ) : (
        <ul className="divide-y divide-bordure">
          {sessions.map((s) => (
            <li key={s.id_session} className="flex items-center justify-between gap-4 py-2 text-sm">
              <span className="min-w-0">
                <span className="block truncate text-texte">
                  {s.ip ?? 'IP inconnue'} {s.est_courante && <span className="text-xs text-accent">(session actuelle)</span>}
                </span>
                <span className="block truncate text-xs text-texte-attenue">
                  {s.user_agent ?? 'Agent inconnu'} · dernière activité {formatDateHeure(s.derniere_utilisation)}
                </span>
              </span>
              <button
                onClick={() => handleRevoke(s.id_session)}
                disabled={s.est_courante}
                className="shrink-0 text-xs text-negatif hover:underline disabled:opacity-40 disabled:hover:no-underline"
              >
                Révoquer
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <EtatErreur message={error} />}
    </Card>
  )
}

/** Journal d'accès (backlog 2.L.2) : qui s'est connecté, quand, résultat — réservé
 * au propriétaire (`require_role`, cf. `routers/auth.py`). Pagination simple. */
function JournalAccesCard() {
  const [entrees, setEntrees] = useState<AccessLogEntry[]>([])
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    api
      .getAccessLog(page)
      .then(setEntrees)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [page])

  return (
    <Card title="Journal d'accès">
      <p className="mb-4 text-sm text-texte-attenue">Historique des connexions et déconnexions, réussies ou non.</p>
      {loading ? (
        <SkeletonTexte />
      ) : entrees.length === 0 ? (
        <EtatVide titre={`Aucune entrée${page > 1 ? ' sur cette page' : ''}.`} />
      ) : (
        <ul className="divide-y divide-bordure">
          {entrees.map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-4 py-2 text-sm">
              <span className="text-texte">
                {e.username_saisi} · {e.action === 'login' ? 'connexion' : 'déconnexion'} · {e.ip ?? 'IP inconnue'}
              </span>
              <span className={e.resultat === 'succes' ? 'text-positif' : 'text-negatif'}>
                {e.resultat === 'succes' ? 'Succès' : `Échec (${e.raison ?? '?'})`} · {formatDateHeure(e.timestamp)}
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex items-center gap-3 text-xs">
        <button
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page === 1}
          className="rounded-md border border-bordure px-2 py-1 text-texte disabled:opacity-40"
        >
          Page précédente
        </button>
        <span className="text-texte-attenue">Page {page}</span>
        <button
          onClick={() => setPage((p) => p + 1)}
          disabled={entrees.length === 0}
          className="rounded-md border border-bordure px-2 py-1 text-texte disabled:opacity-40"
        >
          Page suivante
        </button>
      </div>
      {error && <EtatErreur message={error} />}
    </Card>
  )
}

const ROLE_LABELS: Record<Role, string> = { proprietaire: 'Propriétaire', membre: 'Membre du foyer', invite: 'Invité' }

/** Comptes du foyer (backlog 2.L.2) : le propriétaire crée les comptes membre/invité
 * — l'auto-inscription se ferme après le tout premier compte (`routers/auth.py`).
 * Un invité doit se voir assigner au moins un détenteur pour voir quoi que ce soit
 * (périmètre vide par défaut, jamais "tout le foyer" implicitement). */
function GestionFoyerCard() {
  const [membres, setMembres] = useState<HouseholdMember[]>([])
  const [detenteurs, setDetenteurs] = useState<Detenteur[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<'membre' | 'invite'>('membre')
  const [detenteurIds, setDetenteurIds] = useState<number[]>([])
  const [saving, setSaving] = useState(false)

  function load() {
    setLoading(true)
    Promise.all([api.listHouseholdMembers(), api.listDetenteurs()])
      .then(([m, d]) => {
        setMembres(m)
        setDetenteurs(d)
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!username.trim() || password.length < 8) return
    setSaving(true)
    setError(null)
    try {
      await api.createHouseholdMember({
        username: username.trim(),
        password,
        role,
        detenteur_ids: role === 'invite' ? detenteurIds : undefined,
      })
      setUsername('')
      setPassword('')
      setDetenteurIds([])
      load()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: number) {
    setError(null)
    try {
      await api.deleteHouseholdMember(id)
      load()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  function toggleDetenteur(id: number) {
    setDetenteurIds((prev) => (prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]))
  }

  return (
    <Card title="Comptes du foyer">
      <p className="mb-4 text-sm text-texte-attenue">
        Un membre peut consulter et saisir des actifs/emprunts/transactions du foyer, mais pas les objectifs ni la
        sécurité. Un invité ne voit, en lecture seule, que le patrimoine net et le portefeuille des détenteurs qui lui
        sont assignés ci-dessous.
      </p>

      {loading ? (
        <SkeletonTexte />
      ) : membres.length === 0 ? (
        <EtatVide titre="Aucun autre compte dans ce foyer." />
      ) : (
        <ul className="mb-4 divide-y divide-bordure">
          {membres.map((m) => (
            <li key={m.id} className="flex items-center justify-between py-2 text-sm">
              <span className="text-texte">
                {m.username} <span className="text-xs text-texte-attenue">({ROLE_LABELS[m.role]})</span>
              </span>
              <button onClick={() => handleDelete(m.id)} className="text-xs text-negatif hover:underline">
                Supprimer
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={handleAdd} className="flex flex-wrap items-end gap-3 border-t border-bordure pt-4">
        <label className="flex flex-col gap-1 text-xs font-medium text-texte-attenue">
          Nom d'utilisateur
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-36 rounded-md border border-bordure bg-surface px-2 py-1.5 text-sm text-texte"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-texte-attenue">
          Mot de passe
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            className="w-36 rounded-md border border-bordure bg-surface px-2 py-1.5 text-sm text-texte"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-texte-attenue">
          Rôle
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as 'membre' | 'invite')}
            className="rounded-md border border-bordure bg-surface px-2 py-1.5 text-sm text-texte"
          >
            <option value="membre">Membre du foyer</option>
            <option value="invite">Invité</option>
          </select>
        </label>
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-surface disabled:opacity-40"
        >
          Ajouter
        </button>
      </form>

      {role === 'invite' && (
        <div className="mt-3 flex flex-wrap gap-2">
          {detenteurs.map((d) => (
            <label key={d.id} className="flex items-center gap-1.5 text-xs text-texte">
              <input type="checkbox" checked={detenteurIds.includes(d.id)} onChange={() => toggleDetenteur(d.id)} />
              {d.nom}
            </label>
          ))}
          {detenteurs.length === 0 && <span className="text-xs text-texte-attenue">Aucun détenteur déclaré.</span>}
        </div>
      )}

      {error && <EtatErreur message={error} />}
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
      <h2 className="text-xl font-semibold text-texte">Réglages</h2>

      {loading && <SkeletonTexte />}
      {error && <EtatErreur message={error} />}

      <div className="space-y-4">
        <DetenteursCard />
        <PreferencesCard />
        <GestionFoyerCard />
        <SessionsCard />
        <JournalAccesCard />
      </div>

      <div className="space-y-4">
        {jobs.map((job) => (
          <JobCard key={job.job_key} job={job} onChange={updateJobInState} />
        ))}
      </div>

      <Card title="Exporter">
        <p className="mb-4 text-sm text-texte">
          Fichiers CSV compatibles Excel (séparateur point-virgule, décimale virgule), téléchargés directement par le
          navigateur.
        </p>
        <div className="flex flex-wrap gap-3">
          <a
            href="/api/export/positions"
            className="rounded-md bg-texte px-4 py-2 text-sm font-medium text-surface"
          >
            Positions
          </a>
          <a
            href="/api/export/transactions"
            className="rounded-md bg-texte px-4 py-2 text-sm font-medium text-surface"
          >
            Transactions
          </a>
          <a
            href="/api/export/performance"
            className="rounded-md bg-texte px-4 py-2 text-sm font-medium text-surface"
          >
            Rentabilité
          </a>
        </div>

        <p className="mb-4 mt-6 text-sm text-texte">
          Relevé de patrimoine PDF : une photographie mise en forme, prête à imprimer ou archiver — patrimoine net,
          répartition et rentabilité globale.
        </p>
        <a
          href="/api/export/patrimoine.pdf"
          className="inline-block rounded-md border border-texte px-4 py-2 text-sm font-medium text-texte"
        >
          Relevé de patrimoine (PDF)
        </a>
      </Card>
    </div>
  )
}
