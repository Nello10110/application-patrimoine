import { useMemo, useState } from 'react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import Card from '../components/Card'
import StatTile from '../components/StatTile'
import { COULEUR_AXE, COULEUR_GRILLE, STYLE_INFOBULLE, STYLE_TICK_AXE } from '../utils/chartTheme'
import { formatEuro } from '../utils/format'
import { arrondi, calculerTrajectoire } from '../utils/interetsComposes'

const DUREES = [5, 10, 20, 30] as const

export default function OutilsPage() {
  const [capital, setCapital] = useState('10000')
  const [taux, setTaux] = useState('5')
  const [versement, setVersement] = useState('200')
  const [duree, setDuree] = useState<number>(20)

  const capitalNum = Number(capital)
  const tauxNum = Number(taux)
  const versementNum = Number(versement)
  const valide =
    capital !== '' &&
    taux !== '' &&
    versement !== '' &&
    !Number.isNaN(capitalNum) &&
    !Number.isNaN(tauxNum) &&
    !Number.isNaN(versementNum) &&
    capitalNum >= 0 &&
    versementNum >= 0

  const points = useMemo(
    () => (valide ? calculerTrajectoire(capitalNum, tauxNum, versementNum, duree) : []),
    [valide, capitalNum, tauxNum, versementNum, duree],
  )

  const dernierPoint = points[points.length - 1]
  const valeurFinale = dernierPoint?.valeur ?? 0
  const totalVerse = dernierPoint?.investi ?? 0
  const gains = arrondi(valeurFinale - totalVerse)

  const data = points.map((p) => ({ annee: p.annee, Investi: p.investi, Gains: arrondi(p.valeur - p.investi) }))

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Outils</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Calculs génériques, indépendants du patrimoine suivi par l'application.
        </p>
      </div>

      <Card title="Calculateur d'intérêts composés">
        <div className="flex flex-wrap items-end gap-4">
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-500 dark:text-slate-400">
            Capital de départ (€)
            <input
              value={capital}
              onChange={(e) => setCapital(e.target.value)}
              type="number"
              step="any"
              min={0}
              className="w-36 rounded-md border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-500 dark:text-slate-400">
            Taux annuel moyen (%)
            <input
              value={taux}
              onChange={(e) => setTaux(e.target.value)}
              type="number"
              step="any"
              className="w-28 rounded-md border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-500 dark:text-slate-400">
            Versement mensuel (€)
            <input
              value={versement}
              onChange={(e) => setVersement(e.target.value)}
              type="number"
              step="any"
              min={0}
              className="w-32 rounded-md border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
            />
          </label>
          <div className="flex flex-col gap-1 text-xs font-medium text-slate-500 dark:text-slate-400">
            Durée
            <div className="flex gap-1">
              {DUREES.map((d) => (
                <button
                  key={d}
                  onClick={() => setDuree(d)}
                  className={`rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors ${
                    duree === d
                      ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600'
                  }`}
                >
                  {d} ans
                </button>
              ))}
            </div>
          </div>
        </div>

        {!valide && <p className="mt-3 text-sm text-red-600 dark:text-red-400">Renseigne des valeurs numériques positives.</p>}

        {valide && (
          <>
            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <StatTile label="Valeur finale" value={formatEuro(valeurFinale, 0)} />
              <StatTile label="Total versé" value={formatEuro(totalVerse, 0)} />
              <StatTile label="Dont intérêts gagnés" value={formatEuro(gains, 0)} tone="good" />
            </div>

            <ResponsiveContainer width="100%" height={280} className="mt-4">
              <AreaChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke={COULEUR_GRILLE} />
                <XAxis
                  dataKey="annee"
                  tickFormatter={(v) => `+${v} an${v > 1 ? 's' : ''}`}
                  tick={{ fontSize: 11, ...STYLE_TICK_AXE }}
                  stroke={COULEUR_AXE}
                />
                <YAxis tickFormatter={(v) => formatEuro(Number(v), 0)} width={90} tick={{ fontSize: 11, ...STYLE_TICK_AXE }} stroke={COULEUR_AXE} />
                <Tooltip
                  formatter={(value) => formatEuro(Number(value), 0)}
                  labelFormatter={(v) => `Dans ${v} an${Number(v) > 1 ? 's' : ''}`}
                  {...STYLE_INFOBULLE}
                />
                <Area type="monotone" dataKey="Investi" stackId="1" stroke="#94a3b8" fill="#cbd5e1" />
                <Area type="monotone" dataKey="Gains" stackId="1" stroke="#16a34a" fill="#86efac" />
              </AreaChart>
            </ResponsiveContainer>
          </>
        )}
      </Card>
    </div>
  )
}
