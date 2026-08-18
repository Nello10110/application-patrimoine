import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import type { AnalysisResponse, PerformanceSummary } from '../api/types'
import AllocationBarChart from '../components/AllocationBarChart'
import Card from '../components/Card'
import CompositionModal from '../components/CompositionModal'
import PerformanceCard from '../components/PerformanceCard'
import PortfolioHistoryChart from '../components/PortfolioHistoryChart'
import StatTile from '../components/StatTile'
import { formatEuro } from '../utils/format'

const CURRENT_YEAR = new Date().getFullYear()
const annee = CURRENT_YEAR

export default function DashboardPage() {
  const [analysis, setAnalysis] = useState<AnalysisResponse | null>(null)
  const [performance, setPerformance] = useState<PerformanceSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [modal, setModal] = useState<{ type: 'geo' | 'sector'; categorie: string } | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    api
      .getAnalysis(annee)
      .then(setAnalysis)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    api.getPerformance().then(setPerformance).catch(() => setPerformance(null))
  }, [])

  if (loading) return <p className="text-slate-500">Chargement...</p>
  if (error) return <p className="text-red-600">Erreur: {error}</p>
  if (!analysis) return null

  const hasNoHoldings = analysis.risques.nombre_lignes === 0
  const hasNoTargets = analysis.geo.every((g) => g.pourcentage_cible === null) && analysis.sector.every((s) => s.pourcentage_cible === null)

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-slate-900">Tableau de bord {annee}</h2>

      <PortfolioHistoryChart />

      {hasNoHoldings && (
        <Card className="border-amber-200 bg-amber-50">
          <p className="text-sm text-amber-800">
            Aucune position dans le portefeuille. Commence par{' '}
            <Link to="/import" className="font-medium underline">
              importer ton portefeuille
            </Link>
            .
          </p>
        </Card>
      )}

      {hasNoTargets && !hasNoHoldings && (
        <Card className="border-amber-200 bg-amber-50">
          <p className="text-sm text-amber-800">
            Aucun objectif défini pour {annee}. Va sur la page{' '}
            <Link to="/objectifs" className="font-medium underline">
              Objectifs
            </Link>{' '}
            pour en définir.
          </p>
        </Card>
      )}

      {performance && performance.nombre_transactions > 0 && <PerformanceCard performance={performance} />}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatTile label="Valeur des positions" value={formatEuro(analysis.valeur_totale, 0)} />
        <StatTile
          label="Score de diversification"
          value={`${analysis.risques.score_diversification}/100`}
          tone={analysis.risques.score_diversification < 50 ? 'warning' : 'good'}
        />
        <StatTile
          label="Plus grosse ligne"
          value={`${analysis.risques.top_ligne_poids}%`}
          sub={analysis.risques.top_ligne_nom ?? undefined}
          tone={analysis.risques.top_ligne_poids > 20 ? 'warning' : 'neutral'}
        />
        <StatTile
          label="Concentration géographique"
          value={`${analysis.risques.top_pays_poids}%`}
          sub={analysis.risques.top_pays_nom ?? undefined}
          tone={analysis.risques.top_pays_poids > 60 ? 'warning' : 'neutral'}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card title="Répartition géographique — réel vs cible">
          {analysis.geo.length > 0 ? (
            <AllocationBarChart items={analysis.geo} onCategoryClick={(categorie) => setModal({ type: 'geo', categorie })} />
          ) : (
            <p className="text-sm text-slate-500">Aucune donnée</p>
          )}
          <p className="mt-2 text-xs text-slate-400">
            Géographie des fonds/ETF estimée à partir de leurs 10 plus grosses lignes (extrapolée à 100% du fonds) ; secteur
            des fonds basé sur leur composition complète. Clique sur une barre pour voir le détail des lignes.
          </p>
        </Card>
        <Card title="Répartition sectorielle — réel vs cible">
          {analysis.sector.length > 0 ? (
            <AllocationBarChart items={analysis.sector} onCategoryClick={(categorie) => setModal({ type: 'sector', categorie })} />
          ) : (
            <p className="text-sm text-slate-500">Aucune donnée</p>
          )}
        </Card>
      </div>

      {modal && <CompositionModal type={modal.type} categorie={modal.categorie} onClose={() => setModal(null)} />}

      <Card title="Actions de rééquilibrage recommandées">
        {analysis.recommandations.length === 0 ? (
          <p className="text-sm text-slate-500">
            {hasNoTargets || hasNoHoldings
              ? 'Renseigne un portefeuille et des objectifs pour voir les recommandations.'
              : 'Portefeuille bien aligné avec les objectifs, aucune action nécessaire.'}
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {analysis.recommandations.map((action) => (
              <li key={`${action.type}-${action.categorie}`} className="flex items-center justify-between py-3">
                <div>
                  <p className="text-sm font-medium text-slate-900">{action.categorie}</p>
                  <p className="text-xs text-slate-500">
                    {action.type === 'geo' ? 'Géographie' : 'Secteur'} · écart de {action.ecart_pourcentage > 0 ? '+' : ''}
                    {action.ecart_pourcentage}%
                  </p>
                </div>
                <div className="text-right">
                  <p className={`text-sm font-semibold ${action.sens === 'reduire' ? 'text-amber-600' : 'text-emerald-600'}`}>
                    {action.sens === 'reduire' ? 'Réduire' : 'Augmenter'} de {formatEuro(action.montant_a_ajuster, 0)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
