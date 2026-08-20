import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { AllocationTargetInput, AnalysisResponse } from '../api/types'
import Card from '../components/Card'
import { formatEuro } from '../utils/format'

const CURRENT_YEAR = new Date().getFullYear()
const ANNEE_MIN = 1990
const ANNEE_MAX = 2100

function AllocationEditor({
  title,
  items,
  onChange,
}: {
  title: string
  items: AllocationTargetInput[]
  onChange: (items: AllocationTargetInput[]) => void
}) {
  const [newCategorie, setNewCategorie] = useState('')
  const [erreurAjout, setErreurAjout] = useState<string | null>(null)
  const total = items.reduce((sum, i) => sum + (i.pourcentage_cible || 0), 0)

  function updatePct(categorie: string, value: number) {
    onChange(items.map((i) => (i.categorie === categorie ? { ...i, pourcentage_cible: value } : i)))
  }

  function remove(categorie: string) {
    onChange(items.filter((i) => i.categorie !== categorie))
  }

  function add() {
    const name = newCategorie.trim()
    if (!name) {
      setErreurAjout('Le nom de la catégorie ne peut pas être vide.')
      return
    }
    if (items.some((i) => i.categorie === name)) {
      setErreurAjout(`La catégorie "${name}" existe déjà.`)
      return
    }
    setErreurAjout(null)
    onChange([...items, { categorie: name, pourcentage_cible: 0 }])
    setNewCategorie('')
  }

  return (
    <Card title={title}>
      <div className="space-y-2">
        {items.map((item) => (
          <div key={item.categorie} className="flex items-center gap-3">
            <span className="flex-1 text-sm text-slate-700 dark:text-slate-300">{item.categorie}</span>
            <input
              type="number"
              step="any"
              value={item.pourcentage_cible}
              onChange={(e) => updatePct(item.categorie, Number(e.target.value))}
              className="w-24 rounded-md border border-slate-300 px-2 py-1 text-right text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
            />
            <span className="w-4 text-xs text-slate-400 dark:text-slate-500">%</span>
            <button onClick={() => remove(item.categorie)} className="text-xs text-red-600 hover:underline dark:text-red-400">
              ✕
            </button>
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <input
          value={newCategorie}
          onChange={(e) => {
            setNewCategorie(e.target.value)
            if (erreurAjout) setErreurAjout(null)
          }}
          placeholder="Nouvelle catégorie"
          className="flex-1 rounded-md border border-slate-300 px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
        />
        <button
          onClick={add}
          className="rounded-md border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 dark:border-slate-600 dark:text-slate-300"
        >
          Ajouter
        </button>
      </div>
      {erreurAjout && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{erreurAjout}</p>}

      <p
        className={`mt-3 text-sm font-medium ${Math.abs(total - 100) < 0.5 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}
      >
        Total : {total.toFixed(1)}% {Math.abs(total - 100) < 0.5 ? '✓' : '(doit sommer à 100%)'}
      </p>
    </Card>
  )
}

/** Objectifs de répartition et rééquilibrage réunis dans un seul écran (fusion
 * Objectifs/Rééquilibrage) : ce sont deux vues d'un même concept pour une année
 * donnée — les cibles saisies ici, et les écarts/actions qu'elles impliquent une
 * fois comparées au portefeuille réel — plutôt que deux onglets séparés partageant
 * déjà le même sélecteur d'année. Après un enregistrement réussi, la partie
 * rééquilibrage se recharge automatiquement pour refléter les nouvelles cibles. */
export default function RepartitionPage() {
  const [annee, setAnnee] = useState(CURRENT_YEAR)
  const [anneesDisponibles, setAnneesDisponibles] = useState<number[]>([CURRENT_YEAR, CURRENT_YEAR + 1])
  const [nouvelleAnnee, setNouvelleAnnee] = useState('')
  const [erreurNouvelleAnnee, setErreurNouvelleAnnee] = useState<string | null>(null)
  const [geo, setGeo] = useState<AllocationTargetInput[]>([])
  const [sector, setSector] = useState<AllocationTargetInput[]>([])
  const [loadingTargets, setLoadingTargets] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [echecChargement, setEchecChargement] = useState<string | null>(null)

  const [analysis, setAnalysis] = useState<AnalysisResponse | null>(null)
  const [loadingAnalysis, setLoadingAnalysis] = useState(true)
  const [erreurAnalysis, setErreurAnalysis] = useState<string | null>(null)

  // Le sélecteur d'année s'alimente des années réellement enregistrées
  // (`GET /api/targets/`, cf. LOT 5.4) plutôt que de la fenêtre glissante
  // année précédente/courante/suivante posée en dur auparavant — une année cible
  // saisie il y a plusieurs années doit rester accessible.
  function inclureAnnees(annees: number[]) {
    setAnneesDisponibles((prev) => {
      const ensemble = new Set([...prev, ...annees, CURRENT_YEAR, CURRENT_YEAR + 1])
      return Array.from(ensemble).sort((a, b) => b - a)
    })
  }

  useEffect(() => {
    api
      .listTargetYears()
      .then(inclureAnnees)
      .catch(() => {
        // Liste d'années dégradée sans année déjà enregistrée plutôt qu'un
        // sélecteur bloquant : l'utilisateur peut toujours en ajouter une à la main.
      })
  }, [])

  function ajouterAnnee() {
    const valeur = nouvelleAnnee.trim()
    const parsed = Number(valeur)
    if (!valeur || !Number.isInteger(parsed)) {
      setErreurNouvelleAnnee('Saisis une année entière.')
      return
    }
    if (parsed < ANNEE_MIN || parsed > ANNEE_MAX) {
      setErreurNouvelleAnnee(`L'année doit être comprise entre ${ANNEE_MIN} et ${ANNEE_MAX}.`)
      return
    }
    setErreurNouvelleAnnee(null)
    inclureAnnees([parsed])
    setAnnee(parsed)
    setNouvelleAnnee('')
  }

  // `compteurRechargement` sert uniquement à relancer l'effet ci-dessous au clic sur
  // « Réessayer », sans dupliquer la logique de chargement hors de l'effet.
  const [compteurRechargement, setCompteurRechargement] = useState(0)

  useEffect(() => {
    let annule = false
    setLoadingTargets(true)
    setMessage(null)
    setEchecChargement(null)
    api
      .getTargets(annee)
      .then(async (existing) => {
        if (existing.length > 0) {
          return {
            geo: existing.filter((t) => t.type === 'geo').map((t) => ({ categorie: t.categorie, pourcentage_cible: t.pourcentage_cible })),
            sector: existing
              .filter((t) => t.type === 'sector')
              .map((t) => ({ categorie: t.categorie, pourcentage_cible: t.pourcentage_cible })),
          }
        }
        const defaults = await api.getDefaultTargets()
        return { geo: defaults.geo, sector: defaults.sector }
      })
      .then((charges) => {
        if (annule) return
        setGeo(charges.geo)
        setSector(charges.sector)
      })
      .catch((err) => {
        if (annule) return
        // Sans ce traitement, un échec de chargement laissait deux éditeurs VIDES sans
        // aucun message : un clic sur « Enregistrer » aurait alors écrasé les objectifs
        // réellement enregistrés par une répartition vide. On bloque donc la saisie et
        // on propose explicitement de réessayer.
        setEchecChargement((err as Error).message)
        setGeo([])
        setSector([])
      })
      .finally(() => {
        if (!annule) setLoadingTargets(false)
      })

    return () => {
      annule = true
    }
  }, [annee, compteurRechargement])

  function chargerAnalysis() {
    setLoadingAnalysis(true)
    setErreurAnalysis(null)
    api
      .getAnalysis(annee)
      .then(setAnalysis)
      .catch((err) => setErreurAnalysis(err.message))
      .finally(() => setLoadingAnalysis(false))
  }

  useEffect(chargerAnalysis, [annee])

  async function handleSave() {
    setSaving(true)
    setMessage(null)
    try {
      await api.setTargets(annee, { annee, geo, sector })
      setMessage({ type: 'success', text: 'Objectifs enregistrés.' })
      chargerAnalysis() // le rééquilibrage ci-dessous doit refléter les nouvelles cibles
    } catch (err) {
      setMessage({ type: 'error', text: (err as Error).message })
    } finally {
      setSaving(false)
    }
  }

  const hasNoHoldings = analysis ? analysis.risques.nombre_lignes === 0 : false
  const hasNoTargets = analysis
    ? analysis.geo.every((g) => g.pourcentage_cible === null) && analysis.sector.every((s) => s.pourcentage_cible === null)
    : false

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Répartition {annee}</h2>
        <div className="flex items-center gap-3">
          <select
            value={annee}
            onChange={(e) => setAnnee(Number(e.target.value))}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
          >
            {anneesDisponibles.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <div className="flex flex-col">
            <div className="flex items-center gap-1">
              <input
                value={nouvelleAnnee}
                onChange={(e) => {
                  setNouvelleAnnee(e.target.value)
                  if (erreurNouvelleAnnee) setErreurNouvelleAnnee(null)
                }}
                placeholder="Ajouter une année"
                aria-label="Ajouter une année"
                className="w-32 rounded-md border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
              />
              <button
                onClick={ajouterAnnee}
                type="button"
                className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 dark:border-slate-600 dark:text-slate-300"
              >
                Ajouter
              </button>
            </div>
            {erreurNouvelleAnnee && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{erreurNouvelleAnnee}</p>}
          </div>
          <button
            onClick={handleSave}
            disabled={saving || loadingTargets || echecChargement !== null}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-40 dark:bg-blue-500"
          >
            {saving ? 'Enregistrement...' : 'Enregistrer'}
          </button>
        </div>
      </div>

      {message && (
        <p className={`text-sm ${message.type === 'success' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
          {message.text}
        </p>
      )}

      {echecChargement && (
        <Card className="border-red-200 bg-red-50 dark:border-red-500/40 dark:bg-red-500/10">
          <p className="text-sm text-red-800 dark:text-red-300">
            Impossible de charger les objectifs de {annee} : {echecChargement}
          </p>
          <p className="mt-1 text-xs text-red-700 dark:text-red-400">
            La saisie est désactivée tant que les objectifs enregistrés n'ont pas pu être relus — enregistrer
            maintenant les remplacerait par une répartition vide.
          </p>
          <button
            onClick={() => setCompteurRechargement((n) => n + 1)}
            type="button"
            className="mt-3 rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white dark:bg-slate-100 dark:text-slate-900"
          >
            Réessayer
          </button>
        </Card>
      )}

      {echecChargement ? null : loadingTargets ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">Chargement...</p>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <AllocationEditor title="Répartition géographique" items={geo} onChange={setGeo} />
          <AllocationEditor title="Répartition sectorielle" items={sector} onChange={setSector} />
        </div>
      )}

      <div>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Rééquilibrage</h3>

        {loadingAnalysis && <p className="text-sm text-slate-500 dark:text-slate-400">Chargement...</p>}
        {erreurAnalysis && <p className="text-sm text-red-600 dark:text-red-400">Erreur: {erreurAnalysis}</p>}

        {!loadingAnalysis && !erreurAnalysis && analysis && (
          <div className="space-y-4">
            {analysis.alertes.length > 0 && (
              <Card className="border-amber-300 bg-amber-50 dark:border-amber-400/30 dark:bg-amber-950/40">
                <p className="mb-3 text-sm font-semibold text-amber-800 dark:text-amber-300">
                  {analysis.alertes.length} alerte{analysis.alertes.length > 1 ? 's' : ''} de rééquilibrage
                </p>
                <ul className="space-y-1 pl-4">
                  {analysis.alertes.map((alerte) => (
                    <li key={`${alerte.type}-${alerte.categorie}`} className="text-sm text-amber-800 dark:text-amber-200/90">
                      <span className="font-medium">{alerte.categorie}</span> ({alerte.type === 'geo' ? 'géographie' : 'secteur'}) :
                      écart de {alerte.ecart_pourcentage > 0 ? '+' : ''}
                      {alerte.ecart_pourcentage}% par rapport à l'objectif
                    </li>
                  ))}
                </ul>
              </Card>
            )}

            <Card title="Actions de rééquilibrage recommandées">
              {analysis.recommandations.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {hasNoTargets || hasNoHoldings
                    ? 'Renseigne un portefeuille et des objectifs pour voir les recommandations.'
                    : 'Portefeuille bien aligné avec les objectifs, aucune action nécessaire.'}
                </p>
              ) : (
                <ul className="divide-y divide-slate-100 dark:divide-slate-700">
                  {analysis.recommandations.map((action) => (
                    <li key={`${action.type}-${action.categorie}`} className="flex items-center justify-between py-3">
                      <div>
                        <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{action.categorie}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {action.type === 'geo' ? 'Géographie' : 'Secteur'} · écart de {action.ecart_pourcentage > 0 ? '+' : ''}
                          {action.ecart_pourcentage}%
                        </p>
                      </div>
                      <div className="text-right">
                        <p
                          className={`text-sm font-semibold ${action.sens === 'reduire' ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}
                        >
                          {action.sens === 'reduire' ? 'Réduire' : 'Augmenter'} de {formatEuro(action.montant_a_ajuster, 0)}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        )}
      </div>
    </div>
  )
}
