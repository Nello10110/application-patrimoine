import { useEffect, useState } from 'react'
import { Legend, Line, LineChart, Tooltip, XAxis, YAxis } from 'recharts'
import { api } from '../api/client'
import type { BenchmarkOption, ComparaisonBenchmark, MetriquesAvancees } from '../api/types'
import Card from './Card'
import EtatErreur from './EtatErreur'
import EtatVide from './EtatVide'
import { Label, Select } from './Field'
import { SkeletonTexte } from './Skeleton'
import { formatDate, formatPct } from '../utils/format'
import { ChartFrame, reperesTemporels } from './ChartFrame'
import { POINTILLES_REPERE, STYLE_INFOBULLE, STYLE_LEGENDE, TRAIT_PRINCIPAL, TRAIT_REPERE } from '../utils/chartTheme'

const COULEUR_PORTEFEUILLE = 'var(--accent)'
// Le comparatif reste distinct de la série principale, mais dans la même famille :
// c'est un repère, pas une seconde catégorie.
const COULEUR_BENCHMARK = 'var(--s4)'

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
  const reperesAxe = reperesTemporels(donneesGraphique, 'date', formatDate)

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
              <Label>TWR cumulé</Label>
              <p className="mt-1 text-xl font-semibold text-texte">{formatPct(metriques.twr_cumule_pct)}</p>
            </div>
            <div>
              <Label>TWR annualisé</Label>
              <p className="mt-1 text-xl font-semibold text-texte">{formatPct(metriques.twr_annualise_pct)}</p>
            </div>
            <div>
              <Label>Volatilité annualisée</Label>
              <p className="mt-1 text-xl font-semibold text-texte">
                {metriques.volatilite_annualisee_pct !== null ? `${metriques.volatilite_annualisee_pct}%` : '—'}
              </p>
            </div>
            <div>
              <Label>Perte maximale (drawdown)</Label>
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
              <h3 className="text-[15px] font-semibold -tracking-[0.01em] text-ink">Comparaison à un indice</h3>
              <Select value={benchmarkChoisi} onChange={(e) => handleBenchmarkChange(e.target.value)} className="w-auto">
                <option value="">Choisir un indice de référence</option>
                {benchmarks.map((b) => (
                  <option key={b.key} value={b.key}>
                    {b.label}
                  </option>
                ))}
              </Select>
            </div>

            {chargementComparaison && <SkeletonTexte lignes={3} />}
            {erreurComparaison && <EtatErreur message={erreurComparaison} onReessayer={() => chargerComparaison(benchmarkChoisi)} />}

            {/* Même langage que la courbe de la Synthèse (maquette, écran Analyse) :
                ni grille ni axe de valeurs, cinq repères de date en HTML sous le
                tracé. L'épaisseur porte la hiérarchie — 2,5 px pour le portefeuille,
                1,5 px en pointillés pour l'indice, qui est un repère et non une
                seconde catégorie. La légende de Recharts reste justifiée ici (deux
                séries nommées, dont l'une porte le nom choisi par l'utilisateur),
                mais à 11 px comme la légende HTML du mode étagé, plus à ses 14 px
                par défaut. */}
            {!chargementComparaison && !erreurComparaison && comparaison && (
              <ChartFrame reperes={reperesAxe} hauteur="panneau">
                <LineChart data={donneesGraphique} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                  <XAxis dataKey="date" hide />
                  <YAxis hide domain={['dataMin', 'dataMax']} />
                  <Tooltip formatter={(value) => `${value}%`} labelFormatter={(date) => formatDate(String(date))} {...STYLE_INFOBULLE} />
                  <Legend wrapperStyle={STYLE_LEGENDE} />
                  <Line
                    type="monotone"
                    dataKey="Portefeuille"
                    stroke={COULEUR_PORTEFEUILLE}
                    dot={false}
                    strokeWidth={TRAIT_PRINCIPAL}
                    isAnimationActive={false}
                  />
                  <Line
                    type="monotone"
                    dataKey={comparaison.label}
                    stroke={COULEUR_BENCHMARK}
                    dot={false}
                    strokeWidth={TRAIT_REPERE}
                    strokeDasharray={POINTILLES_REPERE}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ChartFrame>
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
