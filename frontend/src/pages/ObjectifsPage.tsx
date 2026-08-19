import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { AllocationTargetInput } from '../api/types'
import Card from '../components/Card'

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
            <span className="flex-1 text-sm text-slate-700">{item.categorie}</span>
            <input
              type="number"
              step="any"
              value={item.pourcentage_cible}
              onChange={(e) => updatePct(item.categorie, Number(e.target.value))}
              className="w-24 rounded-md border border-slate-300 px-2 py-1 text-right text-sm"
            />
            <span className="w-4 text-xs text-slate-400">%</span>
            <button onClick={() => remove(item.categorie)} className="text-xs text-red-600 hover:underline">
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
          className="flex-1 rounded-md border border-slate-300 px-2 py-1 text-sm"
        />
        <button onClick={add} className="rounded-md border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700">
          Ajouter
        </button>
      </div>
      {erreurAjout && <p className="mt-1 text-xs text-red-600">{erreurAjout}</p>}

      <p className={`mt-3 text-sm font-medium ${Math.abs(total - 100) < 0.5 ? 'text-emerald-600' : 'text-amber-600'}`}>
        Total : {total.toFixed(1)}% {Math.abs(total - 100) < 0.5 ? '✓' : '(doit sommer à 100%)'}
      </p>
    </Card>
  )
}

export default function ObjectifsPage() {
  const [annee, setAnnee] = useState(CURRENT_YEAR)
  const [anneesDisponibles, setAnneesDisponibles] = useState<number[]>([CURRENT_YEAR, CURRENT_YEAR + 1])
  const [nouvelleAnnee, setNouvelleAnnee] = useState('')
  const [erreurNouvelleAnnee, setErreurNouvelleAnnee] = useState<string | null>(null)
  const [geo, setGeo] = useState<AllocationTargetInput[]>([])
  const [sector, setSector] = useState<AllocationTargetInput[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

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

  useEffect(() => {
    setLoading(true)
    setMessage(null)
    api
      .getTargets(annee)
      .then(async (existing) => {
        if (existing.length > 0) {
          setGeo(existing.filter((t) => t.type === 'geo').map((t) => ({ categorie: t.categorie, pourcentage_cible: t.pourcentage_cible })))
          setSector(
            existing.filter((t) => t.type === 'sector').map((t) => ({ categorie: t.categorie, pourcentage_cible: t.pourcentage_cible })),
          )
        } else {
          const defaults = await api.getDefaultTargets()
          setGeo(defaults.geo)
          setSector(defaults.sector)
        }
      })
      .finally(() => setLoading(false))
  }, [annee])

  async function handleSave() {
    setSaving(true)
    setMessage(null)
    try {
      await api.setTargets(annee, { annee, geo, sector })
      setMessage({ type: 'success', text: 'Objectifs enregistrés.' })
    } catch (err) {
      setMessage({ type: 'error', text: (err as Error).message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-slate-900">Objectifs de répartition</h2>
        <div className="flex items-center gap-3">
          <select
            value={annee}
            onChange={(e) => setAnnee(Number(e.target.value))}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm"
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
                className="w-32 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              />
              <button
                onClick={ajouterAnnee}
                type="button"
                className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700"
              >
                Ajouter
              </button>
            </div>
            {erreurNouvelleAnnee && <p className="mt-1 text-xs text-red-600">{erreurNouvelleAnnee}</p>}
          </div>
          <button
            onClick={handleSave}
            disabled={saving || loading}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            {saving ? 'Enregistrement...' : 'Enregistrer'}
          </button>
        </div>
      </div>

      {message && (
        <p className={`text-sm ${message.type === 'success' ? 'text-emerald-600' : 'text-red-600'}`}>{message.text}</p>
      )}

      {loading ? (
        <p className="text-sm text-slate-500">Chargement...</p>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <AllocationEditor title="Répartition géographique" items={geo} onChange={setGeo} />
          <AllocationEditor title="Répartition sectorielle" items={sector} onChange={setSector} />
        </div>
      )}
    </div>
  )
}
