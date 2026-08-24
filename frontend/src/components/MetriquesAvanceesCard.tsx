import { useEffect, useState } from 'react'
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { api } from '../api/client'
import type { BenchmarkOption, ComparaisonBenchmark, MetriquesAvancees } from '../api/types'
import Card from './Card'
import EtatErreur from './EtatErreur'
import EtatVide from './EtatVide'
import { SkeletonTexte } from './Skeleton'
import { formatPct } from '../utils/format'
import { COULEUR_AXE, COULEUR_GRILLE, STYLE_INFOBULLE, STYLE_TICK_AXE } from '../utils/chartTheme'

const COULEUR_PORTEFEUILLE = '#2563eb'
const COULEUR_BENCHMARK = '#ca8a04'

/** Métriques de performance de niveau professionnel (backlog 2.P.2) : TWR à côté du
 * MWR (rendement money-weighted, déjà affiché dans `PerformanceCard` sous le nom
 * « rendement annualisé »), volatilité annualisée, max drawdown, et comparaison à
 * un indice de référence choisi par l'utilisateur. Toutes ces métriques réutilisent
 * la même série que le graphique d'évolution du tableau de bord — aucun nouveau
 * calcul de fond, seulement une mise en forme différente. */
export default function MetriquesAvanceesCard() {
  const [metriques, setMetriques] = useState<MetriquesAvancees | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [benchmarks, setBenchmarks] = useState<BenchmarkOption[]>([])
  const [benchmarkChoisi, setBenchmarkChoisi] = useState('')
  const [comparaison, setComparaison] = useState<ComparaisonBenchmark | null>(null)
  const [chargementComparaison, setChargementComparaison] = useState(false)
  const [erreurComparaison, setErreurComparaison] = useState<string | null>(null)

  function charger() {
    setLoading(true)
    setError(null)
    Promise.all([api.getMetriquesAvancees(), api.listBenchmarks()])
      .then(([m, b]) => {
        setMetriques(m)
        setBenchmarks(b)
      })
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false))
  }

  useEffect(charger, [])

  function chargerComparaison(benchmark: string) {
    if (!benchmark) {
      setComparaison(null)
      return
    }
    setChargementComparaison(true)
    setErreurComparaison(null)
    api
      .getComparaisonBenchmark(benchmark)
      .then(setComparaison)
      .catch((err) => setErreurComparaison((err as Error).message))
      .finally(() => setChargementComparaison(false))
  }

  function handleBenchmarkChange(benchmark: string) {
    setBenchmarkChoisi(benchmark)
    chargerComparaison(benchmark)
  }

  if (loading) return <SkeletonTexte lignes={3} />
  if (error) return <EtatErreur message={error} onReessayer={charger} />
  if (!metriques) return null

  const donneesGraphique =
    comparaison?.points.map((p) => ({
      date: p.date,
      Portefeuille: p.portefeuille_pct,
      [comparaison.label]: p.benchmark_pct,
    })) ?? []

  return (
    <Card title="Métriques de performance avancées">
      <p className="mb-4 text-sm text-texte-attenue">
        Le rendement annualisé affiché ci-dessus (money-weighted, XIRR) juge votre décision — quand et combien vous avez
        versé. Le <strong>TWR</strong> (time-weighted, ci-dessous) neutralise l'effet de vos versements pour juger le
        placement lui-même : deux personnes investies dans le même portefeuille au même moment ont le même TWR, même avec
        des montants différents.
      </p>

      {metriques.twr_cumule_pct === null ? (
        <EtatVide titre="Historique insuffisant pour calculer ces métriques." />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-texte-attenue">TWR cumulé</p>
              <p className="mt-1 text-xl font-semibold text-texte">{formatPct(metriques.twr_cumule_pct)}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-texte-attenue">TWR annualisé</p>
              <p className="mt-1 text-xl font-semibold text-texte">{formatPct(metriques.twr_annualise_pct)}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-texte-attenue">Volatilité annualisée</p>
              <p className="mt-1 text-xl font-semibold text-texte">
                {metriques.volatilite_annualisee_pct !== null ? `${metriques.volatilite_annualisee_pct}%` : '—'}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-texte-attenue">Perte maximale (drawdown)</p>
              <p className="mt-1 text-xl font-semibold text-negatif">
                {metriques.max_drawdown_pct !== null ? `${metriques.max_drawdown_pct}%` : '—'}
              </p>
              {metriques.max_drawdown_pct !== 0 && (
                <p className="text-xs text-texte-attenue">
                  {metriques.drawdown_recupere
                    ? `récupéré en ${metriques.semaines_recuperation} semaine${(metriques.semaines_recuperation ?? 0) > 1 ? 's' : ''}`
                    : 'non récupéré à ce jour'}
                </p>
              )}
            </div>
          </div>

          <div className="mt-6 border-t border-bordure pt-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-texte-attenue">Comparaison à un indice</h3>
              <select
                value={benchmarkChoisi}
                onChange={(e) => handleBenchmarkChange(e.target.value)}
                className="rounded-md border border-bordure bg-surface px-2 py-1.5 text-sm text-texte"
              >
                <option value="">Choisir un indice de référence</option>
                {benchmarks.map((b) => (
                  <option key={b.key} value={b.key}>
                    {b.label}
                  </option>
                ))}
              </select>
            </div>

            {chargementComparaison && <SkeletonTexte lignes={3} />}
            {erreurComparaison && <EtatErreur message={erreurComparaison} onReessayer={() => chargerComparaison(benchmarkChoisi)} />}

            {!chargementComparaison && !erreurComparaison && comparaison && (
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={donneesGraphique}>
                  <CartesianGrid strokeDasharray="3 3" stroke={COULEUR_GRILLE} />
                  <XAxis dataKey="date" tick={STYLE_TICK_AXE} stroke={COULEUR_AXE} />
                  <YAxis tick={STYLE_TICK_AXE} stroke={COULEUR_AXE} tickFormatter={(v) => `${v}%`} />
                  <Tooltip formatter={(value) => `${value}%`} {...STYLE_INFOBULLE} />
                  <Legend />
                  <Line type="monotone" dataKey="Portefeuille" stroke={COULEUR_PORTEFEUILLE} dot={false} strokeWidth={2} />
                  <Line type="monotone" dataKey={comparaison.label} stroke={COULEUR_BENCHMARK} dot={false} strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            )}

            {!chargementComparaison && !erreurComparaison && !comparaison && !benchmarkChoisi && (
              <p className="text-sm text-texte-attenue">
                Choisis un indice pour comparer l'évolution de ton portefeuille (en %, depuis le début du suivi) à celle de
                cet indice sur la même période.
              </p>
            )}
          </div>
        </>
      )}
    </Card>
  )
}
