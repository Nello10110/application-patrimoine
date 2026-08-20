import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import type { AnalysisResponse, CoutGestionConsolide, PerformanceSummary, RepartitionComptesResponse } from '../api/types'
import AllocationChartCard from '../components/AllocationChartCard'
import Card from '../components/Card'
import CompositionModal from '../components/CompositionModal'
import CoutGestionCard from '../components/CoutGestionCard'
import PatrimoineNetCard from '../components/PatrimoineNetCard'
import PerformanceCard from '../components/PerformanceCard'
import PortfolioHistoryChart from '../components/PortfolioHistoryChart'
import QualiteDonneesCard from '../components/QualiteDonneesCard'
import StatTile from '../components/StatTile'
import { formatEuro } from '../utils/format'

const CURRENT_YEAR = new Date().getFullYear()

export default function DashboardPage() {
  const [annee, setAnnee] = useState(CURRENT_YEAR)
  const [anneesDisponibles, setAnneesDisponibles] = useState<number[]>([CURRENT_YEAR])
  const [analysis, setAnalysis] = useState<AnalysisResponse | null>(null)
  const [performance, setPerformance] = useState<PerformanceSummary | null>(null)
  const [comptes, setComptes] = useState<RepartitionComptesResponse | null>(null)
  const [coutGestion, setCoutGestion] = useState<CoutGestionConsolide | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [modal, setModal] = useState<{ type: 'geo' | 'sector'; categorie: string } | null>(null)

  // Années réellement enregistrées (`GET /api/targets/`, cf. LOT 5.3) plutôt qu'une
  // seule année figée à l'import du module : sans ça, ni le passage à la nouvelle
  // année civile ni la consultation d'un exercice passé n'étaient possibles sans F5.
  useEffect(() => {
    api
      .listTargetYears()
      .then((annees) => {
        const ensemble = new Set([...annees, CURRENT_YEAR])
        setAnneesDisponibles(Array.from(ensemble).sort((a, b) => b - a))
      })
      .catch(() => {
        // Sélecteur dégradé à la seule année courante plutôt que bloquant : l'analyse
        // de cette année reste consultable même si la liste des années échoue.
      })
  }, [])

  // Recharge l'analyse (dépend de l'année sélectionnée) et la rentabilité (globale,
  // indépendante de l'année) — factorisé pour servir à la fois à l'effet déclenché
  // par le changement d'année et au bouton "Actualiser".
  function chargerDonnees() {
    setLoading(true)
    setError(null)
    api
      .getAnalysis(annee)
      .then(setAnalysis)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
    api.getPerformance().then(setPerformance).catch(() => setPerformance(null))
    // Répartition par compte (LOT 5.1) : indépendante de l'année sélectionnée, comme
    // la rentabilité ci-dessus — pas de blocage de la page si elle échoue.
    api.getRepartitionComptes().then(setComptes).catch(() => setComptes(null))
    // Coût de gestion consolidé (§ E.3) : indépendant de l'année sélectionnée, même
    // philosophie que la répartition par compte ci-dessus.
    api.getCoutGestionConsolide().then(setCoutGestion).catch(() => setCoutGestion(null))
  }

  useEffect(chargerDonnees, [annee])

  const hasNoHoldings = analysis ? analysis.risques.nombre_lignes === 0 : false
  const hasNoTargets = analysis
    ? analysis.geo.every((g) => g.pourcentage_cible === null) && analysis.sector.every((s) => s.pourcentage_cible === null)
    : false

  // L'en-tête (sélecteur d'année + bouton "Actualiser") reste affiché quel que soit
  // l'état (chargement, erreur, données) : c'est la seule voie de récupération d'une
  // page restée en erreur, faute d'un rechargement complet (F5).
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Tableau de bord {annee}</h2>
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
          <button
            onClick={chargerDonnees}
            disabled={loading}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40 dark:bg-slate-100 dark:text-slate-900"
          >
            {loading ? 'Actualisation...' : 'Actualiser'}
          </button>
        </div>
      </div>

      <PatrimoineNetCard />

      {loading && <p className="text-slate-500 dark:text-slate-400">Chargement...</p>}
      {error && <p className="text-red-600 dark:text-red-400">Erreur: {error}</p>}

      {!loading && !error && analysis && (
        <>
          <PortfolioHistoryChart />

          {hasNoHoldings && (
            <Card className="border-amber-200 bg-amber-50 dark:border-amber-400/30 dark:bg-amber-950/40">
              <p className="text-sm text-amber-800 dark:text-amber-200/90">
                Aucune position dans le portefeuille. Commence par{' '}
                <Link to="/import" className="font-medium underline">
                  importer ton portefeuille
                </Link>
                .
              </p>
            </Card>
          )}

          {hasNoTargets && !hasNoHoldings && (
            <Card className="border-amber-200 bg-amber-50 dark:border-amber-400/30 dark:bg-amber-950/40">
              <p className="text-sm text-amber-800 dark:text-amber-200/90">
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
            <AllocationChartCard
              title="Répartition géographique — réel vs cible"
              items={analysis.geo}
              onCategoryClick={(categorie) => setModal({ type: 'geo', categorie })}
              footnote={
                <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
                  Géographie des fonds/ETF issue de leur composition réelle (10 plus grosses lignes, extrapolées à 100% du fonds)
                  quand Yahoo Finance la fournit, sinon estimée à partir de l'indice suivi par le fonds (voir le détail de qualité
                  des données ci-dessous) ; secteur des fonds basé sur leur composition complète. Clique sur une barre (ou une
                  ligne du tableau en plein écran) pour voir le détail des lignes.
                </p>
              }
            />
            <AllocationChartCard
              title="Répartition sectorielle — réel vs cible"
              items={analysis.sector}
              onCategoryClick={(categorie) => setModal({ type: 'sector', categorie })}
            />
          </div>

          <QualiteDonneesCard qualite={analysis.qualite_donnees} />

          {coutGestion && <CoutGestionCard cout={coutGestion} />}

          {comptes && comptes.a_des_comptes_annotes && (
            <Card title="Répartition par compte">
              <ul className="divide-y divide-slate-100 dark:divide-slate-700">
                {comptes.items.map((item) => (
                  <li key={item.compte} className="flex items-center justify-between py-2 text-sm">
                    <span className="text-slate-700 dark:text-slate-300">{item.compte}</span>
                    <span className="font-medium text-slate-900 dark:text-slate-100">
                      {formatEuro(item.valeur, 0)} · {item.pourcentage}%
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-slate-400 dark:text-slate-500">{comptes.pas_de_rentabilite_par_compte}</p>
            </Card>
          )}

          {modal && <CompositionModal type={modal.type} categorie={modal.categorie} onClose={() => setModal(null)} />}

          {analysis.alertes.length > 0 && (
            <details className="group rounded-xl border border-amber-300 bg-amber-50 p-5 shadow-sm dark:border-amber-400/30 dark:bg-amber-950/40">
              <summary className="cursor-pointer list-none text-sm font-semibold text-amber-800 marker:content-none dark:text-amber-300">
                <span className="mr-1 inline-block transition-transform group-open:rotate-90">▸</span>
                {analysis.alertes.length} alerte{analysis.alertes.length > 1 ? 's' : ''} de rééquilibrage
              </summary>
              <ul className="mt-3 space-y-1 pl-4">
                {analysis.alertes.map((alerte) => (
                  <li key={`${alerte.type}-${alerte.categorie}`} className="text-sm text-amber-800 dark:text-amber-200/90">
                    <span className="font-medium">{alerte.categorie}</span> ({alerte.type === 'geo' ? 'géographie' : 'secteur'}) :
                    écart de {alerte.ecart_pourcentage > 0 ? '+' : ''}
                    {alerte.ecart_pourcentage}% par rapport à l'objectif
                  </li>
                ))}
              </ul>
            </details>
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
        </>
      )}
    </div>
  )
}
