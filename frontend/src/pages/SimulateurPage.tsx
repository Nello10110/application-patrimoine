import { useEffect, useState } from 'react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { api } from '../api/client'
import type { Simulation, FireResult } from '../api/types'
import Card from '../components/Card'
import StatTile from '../components/StatTile'
import { formatEuro } from '../utils/format'
import { COULEUR_AXE, COULEUR_GRILLE, STYLE_INFOBULLE, STYLE_TICK_AXE } from '../utils/chartTheme'

const HORIZONS = [5, 10, 20, 30] as const

/** Simulateur de patrimoine et indépendance financière (roadmap Phase 2, équivalent
 * gratuit du « Predict » payant de Finary) : projection à intérêts composés depuis
 * le patrimoine net actuel (`GET /api/patrimoine/simulation`), et calcul FIRE séparé
 * mais réutilisant les mêmes hypothèses (`GET /api/patrimoine/fire`). Tout est
 * recalculé côté serveur à chaque changement — aucun calcul client, une seule
 * source de vérité (même principe que `analysis_service.value_holdings`, LOT 6.7). */
export default function SimulateurPage() {
  const [rendement, setRendement] = useState('5')
  const [epargne, setEpargne] = useState('0')
  const [horizon, setHorizon] = useState<number>(20)

  const [simulation, setSimulation] = useState<Simulation | null>(null)
  const [erreurSimulation, setErreurSimulation] = useState<string | null>(null)

  const [depenseCible, setDepenseCible] = useState('')
  const [tauxRetrait, setTauxRetrait] = useState('4')
  const [fire, setFire] = useState<FireResult | null>(null)
  const [erreurFire, setErreurFire] = useState<string | null>(null)

  // Hypothèses saisies au clavier : un léger différé évite de renvoyer une requête
  // à chaque frappe (ex. en tapant "1200", sans lui, on interrogerait successivement
  // 1, 12, 120 puis 1200 pour rien) sans pour autant exiger un bouton "Calculer".
  useEffect(() => {
    const rendementNum = Number(rendement)
    const epargneNum = Number(epargne)
    if (rendement === '' || epargne === '' || Number.isNaN(rendementNum) || Number.isNaN(epargneNum)) return
    const delai = setTimeout(() => {
      setErreurSimulation(null)
      api
        .getSimulation({ rendement_annuel_pct: rendementNum, epargne_mensuelle: epargneNum, annees: horizon })
        .then(setSimulation)
        .catch((err) => setErreurSimulation(err.message))
    }, 300)
    return () => clearTimeout(delai)
  }, [rendement, epargne, horizon])

  useEffect(() => {
    const rendementNum = Number(rendement)
    const epargneNum = Number(epargne)
    const depenseNum = Number(depenseCible)
    const tauxNum = Number(tauxRetrait)
    if (!depenseCible || depenseNum <= 0 || !tauxRetrait || tauxNum <= 0) {
      setFire(null)
      return
    }
    if (Number.isNaN(rendementNum) || Number.isNaN(epargneNum) || Number.isNaN(depenseNum) || Number.isNaN(tauxNum)) return
    const delai = setTimeout(() => {
      setErreurFire(null)
      api
        .getFire({
          rendement_annuel_pct: rendementNum,
          epargne_mensuelle: epargneNum,
          depense_annuelle_cible: depenseNum,
          taux_retrait_pct: tauxNum,
        })
        .then(setFire)
        .catch((err) => setErreurFire(err.message))
    }, 300)
    return () => clearTimeout(delai)
  }, [rendement, epargne, depenseCible, tauxRetrait])

  const data = simulation?.points.map((p) => ({ annee: p.annee, Patrimoine: p.valeur })) ?? []

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Simulateur</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Projection du patrimoine net actuel ({simulation ? formatEuro(simulation.valeur_depart, 0) : '…'}) selon des
          hypothèses de rendement et d'épargne — une <strong>hypothèse</strong>, pas une promesse : les marchés ne progressent
          jamais de façon aussi régulière dans la réalité.
        </p>
      </div>

      <Card title="Hypothèses">
        <div className="flex flex-wrap items-end gap-4">
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-500 dark:text-slate-400">
            Rendement annuel moyen (%)
            <input
              value={rendement}
              onChange={(e) => setRendement(e.target.value)}
              type="number"
              step="any"
              className="w-32 rounded-md border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-500 dark:text-slate-400">
            Épargne mensuelle ajoutée (€)
            <input
              value={epargne}
              onChange={(e) => setEpargne(e.target.value)}
              type="number"
              step="any"
              className="w-36 rounded-md border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
            />
          </label>
          <div className="flex flex-col gap-1 text-xs font-medium text-slate-500 dark:text-slate-400">
            Horizon
            <div className="flex gap-1">
              {HORIZONS.map((h) => (
                <button
                  key={h}
                  onClick={() => setHorizon(h)}
                  className={`rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors ${
                    horizon === h
                      ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600'
                  }`}
                >
                  {h} ans
                </button>
              ))}
            </div>
          </div>
        </div>

        {erreurSimulation && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{erreurSimulation}</p>}

        {data.length > 0 && (
          <ResponsiveContainer width="100%" height={280} className="mt-4">
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke={COULEUR_GRILLE} />
              <XAxis dataKey="annee" tickFormatter={(v) => `+${v} an${v > 1 ? 's' : ''}`} tick={{ fontSize: 11, ...STYLE_TICK_AXE }} stroke={COULEUR_AXE} />
              <YAxis tickFormatter={(v) => formatEuro(Number(v), 0)} width={90} tick={{ fontSize: 11, ...STYLE_TICK_AXE }} stroke={COULEUR_AXE} />
              <Tooltip
                formatter={(value) => formatEuro(Number(value), 0)}
                labelFormatter={(v) => `Dans ${v} an${Number(v) > 1 ? 's' : ''}`}
                {...STYLE_INFOBULLE}
              />
              <Line type="monotone" dataKey="Patrimoine" stroke="#2563eb" dot={false} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </Card>

      <Card title="Indépendance financière (FIRE)">
        <p className="mb-4 text-xs text-slate-400 dark:text-slate-500">
          Le taux de retrait par défaut (4 %) est un choix méthodologique connu sous le nom de « règle des 4 % » — pas une
          vérité universelle, à ajuster selon ta propre prudence.
        </p>
        <div className="flex flex-wrap items-end gap-4">
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-500 dark:text-slate-400">
            Dépense annuelle cible (€)
            <input
              value={depenseCible}
              onChange={(e) => setDepenseCible(e.target.value)}
              type="number"
              step="any"
              placeholder="ex. 30000"
              className="w-36 rounded-md border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-500 dark:text-slate-400">
            Taux de retrait (%)
            <input
              value={tauxRetrait}
              onChange={(e) => setTauxRetrait(e.target.value)}
              type="number"
              step="any"
              className="w-28 rounded-md border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
            />
          </label>
        </div>

        {erreurFire && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{erreurFire}</p>}

        {!depenseCible && <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">Renseigne une dépense annuelle cible pour voir le résultat.</p>}

        {fire && depenseCible && (
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <StatTile label="Patrimoine nécessaire" value={formatEuro(fire.patrimoine_necessaire, 0)} />
            <StatTile
              label="Indépendance financière"
              value={
                fire.annees_avant_independance === null
                  ? 'Non atteinte (60 ans)'
                  : fire.annees_avant_independance === 0
                    ? 'Déjà atteinte'
                    : `Dans ${fire.annees_avant_independance} ans`
              }
              tone={fire.annees_avant_independance === null ? 'warning' : 'good'}
            />
          </div>
        )}
      </Card>
    </div>
  )
}
