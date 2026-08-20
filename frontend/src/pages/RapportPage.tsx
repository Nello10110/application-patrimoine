import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { RapportPeriode } from '../api/types'
import Card from '../components/Card'
import { formatDate, formatEuro, formatPct } from '../utils/format'

type Mode = 'mensuel' | 'annuel' | 'personnalise'

const MODES: { value: Mode; label: string }[] = [
  { value: 'mensuel', label: 'Mensuel' },
  { value: 'annuel', label: 'Annuel' },
  { value: 'personnalise', label: 'Personnalisé' },
]

function aujourdhuiISO(): string {
  return new Date().toISOString().slice(0, 10)
}

function moisCourant(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function libelleMois(moisSelectionne: string): string {
  const [annee, mois] = moisSelectionne.split('-').map(Number)
  const libelle = new Date(annee, mois - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
  return libelle.charAt(0).toUpperCase() + libelle.slice(1)
}

/** Dernier jour du mois `mois` (1-12) de `annee` — `new Date(annee, mois, 0)` retombe
 * sur le dernier jour du mois précédent l'index `mois` (0-indexé), donc exactement le
 * dernier jour du mois `mois` (1-indexé) demandé. */
function bornesDuMois(moisSelectionne: string): { dateDebut: string; dateFin: string } {
  const [anneeStr, moisStr] = moisSelectionne.split('-')
  const dernierJour = new Date(Number(anneeStr), Number(moisStr), 0).getDate()
  return { dateDebut: `${anneeStr}-${moisStr}-01`, dateFin: `${anneeStr}-${moisStr}-${String(dernierJour).padStart(2, '0')}` }
}

function bornesDeLAnnee(annee: number): { dateDebut: string; dateFin: string } {
  return { dateDebut: `${annee}-01-01`, dateFin: `${annee}-12-31` }
}

export default function RapportPage() {
  const [mode, setMode] = useState<Mode>('mensuel')
  const [moisSelectionne, setMoisSelectionne] = useState(moisCourant())
  const [anneeSelectionnee, setAnneeSelectionnee] = useState(new Date().getFullYear())
  const [dateDebutPerso, setDateDebutPerso] = useState(`${moisCourant()}-01`)
  const [dateFinPerso, setDateFinPerso] = useState(aujourdhuiISO())

  const [rapport, setRapport] = useState<RapportPeriode | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const bornes =
    mode === 'mensuel' ? bornesDuMois(moisSelectionne) : mode === 'annuel' ? bornesDeLAnnee(anneeSelectionnee) : { dateDebut: dateDebutPerso, dateFin: dateFinPerso }
  const periodeInvalide = mode === 'personnalise' && dateFinPerso < dateDebutPerso

  useEffect(() => {
    if (periodeInvalide) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    api
      .getRapportPeriode(bornes.dateDebut, bornes.dateFin)
      .then(setRapport)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [mode, moisSelectionne, anneeSelectionnee, dateDebutPerso, dateFinPerso, bornes.dateDebut, bornes.dateFin, periodeInvalide])

  const libellePeriode =
    mode === 'mensuel'
      ? libelleMois(moisSelectionne)
      : mode === 'annuel'
        ? String(anneeSelectionnee)
        : `${formatDate(dateDebutPerso)} au ${formatDate(dateFinPerso)}`

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Rapport</h2>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex gap-1">
            {MODES.map((m) => (
              <button
                key={m.value}
                onClick={() => setMode(m.value)}
                className={`rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors ${
                  mode === m.value
                    ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          {mode === 'mensuel' && (
            <input
              type="month"
              value={moisSelectionne}
              max={moisCourant()}
              onChange={(e) => setMoisSelectionne(e.target.value)}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            />
          )}
          {mode === 'annuel' && (
            <input
              type="number"
              value={anneeSelectionnee}
              min={2000}
              max={new Date().getFullYear()}
              onChange={(e) => setAnneeSelectionnee(Number(e.target.value))}
              className="w-24 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            />
          )}
          {mode === 'personnalise' && (
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={dateDebutPerso}
                max={aujourdhuiISO()}
                onChange={(e) => setDateDebutPerso(e.target.value)}
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              />
              <span className="text-sm text-slate-500 dark:text-slate-400">au</span>
              <input
                type="date"
                value={dateFinPerso}
                max={aujourdhuiISO()}
                onChange={(e) => setDateFinPerso(e.target.value)}
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>
          )}
        </div>
      </div>

      {periodeInvalide && (
        <p className="text-sm text-red-600 dark:text-red-400">La date de fin doit être postérieure ou égale à la date de début.</p>
      )}
      {!periodeInvalide && loading && <p className="text-sm text-slate-500 dark:text-slate-400">Chargement...</p>}
      {!periodeInvalide && error && <p className="text-sm text-red-600 dark:text-red-400">Erreur: {error}</p>}

      {!periodeInvalide && rapport && !loading && (
        <>
          <h3 className="text-sm text-slate-500 dark:text-slate-400">{libellePeriode}</h3>

          {rapport.nombre_transactions === 0 && rapport.valeur_debut_periode === null ? (
            <Card>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Aucune donnée disponible pour cette période (aucune transaction, portefeuille pas encore constitué à cette date).
              </p>
            </Card>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Card title="Valeur en fin de période">
                  <p className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
                    {rapport.valeur_fin_periode !== null ? formatEuro(rapport.valeur_fin_periode, 0) : '—'}
                  </p>
                </Card>
                <Card title="Évolution sur la période">
                  <p
                    className={`text-2xl font-semibold ${
                      rapport.evolution_pct === null
                        ? 'text-slate-900 dark:text-slate-100'
                        : rapport.evolution_pct >= 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-red-600 dark:text-red-400'
                    }`}
                  >
                    {formatPct(rapport.evolution_pct)}
                  </p>
                </Card>
                <Card title="Dividendes perçus">
                  <p className="text-2xl font-semibold text-emerald-600 dark:text-emerald-400">
                    {formatEuro(rapport.dividendes_percus)}
                  </p>
                </Card>
              </div>

              <Card title="Plus gros mouvements de la période">
                {rapport.plus_gros_mouvements.length === 0 ? (
                  <p className="text-sm text-slate-500 dark:text-slate-400">Aucun mouvement sur cette période.</p>
                ) : (
                  <ul className="divide-y divide-slate-100 dark:divide-slate-700">
                    {rapport.plus_gros_mouvements.map((m, i) => (
                      <li key={i} className="flex items-center justify-between py-2 text-sm">
                        <span className="text-slate-700 dark:text-slate-300">
                          {formatDate(m.date)} · {m.nom ?? m.symbol ?? '—'}
                        </span>
                        <span className={`font-medium ${m.montant >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-900 dark:text-slate-100'}`}>
                          {formatEuro(m.montant)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </>
          )}
        </>
      )}
    </div>
  )
}
