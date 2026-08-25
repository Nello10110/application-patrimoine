import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import type { AnalysisResponse, CoutGestionConsolide, PerformanceSummary, PortfolioHistoryPoint, RepartitionComptesResponse } from '../api/types'
import AllocationChartCard from '../components/AllocationChartCard'
import Card from '../components/Card'
import CompositionModal from '../components/CompositionModal'
import CoutGestionCard from '../components/CoutGestionCard'
import Disclosure from '../components/Disclosure'
import EtatErreur from '../components/EtatErreur'
import { SkeletonTexte } from '../components/Skeleton'
import ExpositionConsolideeCard from '../components/ExpositionConsolideeCard'
import MetriquesAvanceesCard from '../components/MetriquesAvanceesCard'
import PatrimoineNetCard from '../components/PatrimoineNetCard'
import RevenusPassifsCard from '../components/RevenusPassifsCard'
import PerformanceCard from '../components/PerformanceCard'
import PortfolioHistoryChart from '../components/PortfolioHistoryChart'
import QualiteDonneesCard from '../components/QualiteDonneesCard'
import StatTile from '../components/StatTile'
import { usePreferencesAffichage } from '../hooks/usePreferencesAffichage'
import { formatEuro } from '../utils/format'

export default function DashboardPage() {
  const { montantsMasques } = usePreferencesAffichage()
  const [analysis, setAnalysis] = useState<AnalysisResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Rentabilité, répartition par compte et coût de gestion (backlog 2.K.5) : chacun
  // son propre état chargement/erreur — indépendants de `analysis`/`loading`
  // ci-dessus, un échec de l'un ne doit ni bloquer ni masquer silencieusement les
  // deux autres.
  const [performance, setPerformance] = useState<PerformanceSummary | null>(null)
  const [chargementPerformance, setChargementPerformance] = useState(true)
  const [erreurPerformance, setErreurPerformance] = useState<string | null>(null)

  const [comptes, setComptes] = useState<RepartitionComptesResponse | null>(null)
  const [chargementComptes, setChargementComptes] = useState(true)
  const [erreurComptes, setErreurComptes] = useState<string | null>(null)

  const [coutGestion, setCoutGestion] = useState<CoutGestionConsolide | null>(null)
  const [chargementCoutGestion, setChargementCoutGestion] = useState(true)
  const [erreurCoutGestion, setErreurCoutGestion] = useState<string | null>(null)

  // Historique du portefeuille (backlog 2.K.6) : remonté ici plutôt que chargé dans
  // `PortfolioHistoryChart` lui-même — partagé avec `PatrimoineNetCard` (variation
  // affichée sur le chiffre principal), un seul appel réseau pour les deux. Endpoint
  // coûteux (jusqu'à une minute), chargé une seule fois au montage.
  const [historique, setHistorique] = useState<PortfolioHistoryPoint[] | null>(null)
  const [chargementHistorique, setChargementHistorique] = useState(true)
  const [erreurHistorique, setErreurHistorique] = useState<string | null>(null)

  const [modal, setModal] = useState<{ type: 'geo' | 'sector'; categorie: string } | null>(null)

  // Recharge l'analyse et la rentabilité — factorisé pour servir à la fois à
  // l'effet de montage et au bouton "Actualiser".
  function chargerPerformance() {
    setChargementPerformance(true)
    setErreurPerformance(null)
    api
      .getPerformance()
      .then(setPerformance)
      .catch((err) => setErreurPerformance(err.message))
      .finally(() => setChargementPerformance(false))
  }

  // Répartition par compte (LOT 5.1) : même philosophie que la rentabilité
  // ci-dessus — pas de blocage de la page si elle échoue.
  function chargerComptes() {
    setChargementComptes(true)
    setErreurComptes(null)
    api
      .getRepartitionComptes()
      .then(setComptes)
      .catch((err) => setErreurComptes(err.message))
      .finally(() => setChargementComptes(false))
  }

  // Coût de gestion consolidé (§ E.3) : même philosophie que la répartition par
  // compte ci-dessus.
  function chargerCoutGestion() {
    setChargementCoutGestion(true)
    setErreurCoutGestion(null)
    api
      .getCoutGestionConsolide()
      .then(setCoutGestion)
      .catch((err) => setErreurCoutGestion(err.message))
      .finally(() => setChargementCoutGestion(false))
  }

  function chargerHistorique() {
    setChargementHistorique(true)
    setErreurHistorique(null)
    api
      .getPortfolioHistory()
      .then((res) => setHistorique(res.points))
      .catch((err) => setErreurHistorique(err.message))
      .finally(() => setChargementHistorique(false))
  }

  function chargerDonnees() {
    setLoading(true)
    setError(null)
    api
      .getAnalysis()
      .then(setAnalysis)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
    chargerPerformance()
    chargerComptes()
    chargerCoutGestion()
  }

  useEffect(chargerDonnees, [])
  useEffect(chargerHistorique, [])

  const hasNoHoldings = analysis ? analysis.risques.nombre_lignes === 0 : false

  // L'en-tête (bouton "Actualiser") reste affiché quel que soit l'état
  // (chargement, erreur, données) : c'est la seule voie de récupération d'une page
  // restée en erreur, faute d'un rechargement complet (F5).
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-texte">Tableau de bord</h2>
        <button
          onClick={chargerDonnees}
          disabled={loading}
          className="rounded-md bg-texte px-4 py-2 text-sm font-medium text-surface disabled:opacity-40"
        >
          {loading ? 'Actualisation...' : 'Actualiser'}
        </button>
      </div>

      {/* Hiérarchie de lecture en trois temps (backlog 2.K.6) : (1) le chiffre —
          patrimoine net, très grand, avec sa variation ; (2) la courbe — évolution
          sur la période, juste en dessous, jamais masquée par un échec de `analysis`
          (limite documentée du backlog 2.K.5, corrigée ici par construction : ni la
          carte ni la courbe ne dépendent plus de `analysis`/`loading`) ; (3) le
          détail — répartition, qualité des données, exposition consolidée, coût de
          gestion, sous la ligne de flottaison et repliable. */}
      <PatrimoineNetCard historiquePortefeuille={{ points: historique, loading: chargementHistorique }} />

      <PortfolioHistoryChart points={historique} loading={chargementHistorique} error={erreurHistorique} onRetry={chargerHistorique} />

      {loading && <SkeletonTexte lignes={4} />}
      {error && <EtatErreur message={error} onReessayer={chargerDonnees} />}

      {!loading && !error && analysis && (
        <>
          {/* Bandeaux à fond teinté : même exception que `QualiteDonneesCard` (backlog
              2.K.1) — hors des 9 jetons sémantiques, pas de jeton de fond teinté
              multi-nuances disponible pour ce besoin. Restent hors du détail repliable
              ci-dessous : ce sont des appels à l'action, pas de la simple information
              complémentaire. */}
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

          <Disclosure title="Détail">
            {chargementPerformance && <SkeletonTexte lignes={2} />}
            {erreurPerformance && <EtatErreur message={erreurPerformance} onReessayer={chargerPerformance} />}
            {!chargementPerformance && !erreurPerformance && performance && performance.nombre_transactions > 0 && (
              <>
                <PerformanceCard performance={performance} />
                <div className="mt-4">
                  <MetriquesAvanceesCard />
                </div>
              </>
            )}

            {/* Indépendant de l'historique de transactions (backlog 2.P.3) : un
                foyer sans aucun achat boursier peut quand même avoir des loyers ou
                une épargne à taux — jamais gardé derrière `nombre_transactions > 0`. */}
            <div className="mt-4">
              <RevenusPassifsCard />
            </div>

            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <StatTile label="Valeur des positions" value={formatEuro(analysis.valeur_totale, 0, montantsMasques)} />
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
                title="Répartition géographique"
                items={analysis.geo}
                onCategoryClick={(categorie) => setModal({ type: 'geo', categorie })}
                footnote={
                  <p className="mt-2 text-xs text-texte-attenue">
                    Géographie des fonds/ETF issue de leur composition réelle (10 plus grosses lignes, extrapolées à 100% du fonds)
                    quand Yahoo Finance la fournit, sinon estimée à partir de l'indice suivi par le fonds (voir le détail de qualité
                    des données ci-dessous) ; secteur des fonds basé sur leur composition complète. Clique sur une barre (ou une
                    ligne du tableau en plein écran) pour voir le détail des lignes.
                  </p>
                }
              />
              <AllocationChartCard
                title="Répartition sectorielle"
                items={analysis.sector}
                onCategoryClick={(categorie) => setModal({ type: 'sector', categorie })}
              />
            </div>

            <QualiteDonneesCard qualite={analysis.qualite_donnees} />

            <ExpositionConsolideeCard />

            {chargementCoutGestion && <SkeletonTexte lignes={2} />}
            {erreurCoutGestion && <EtatErreur message={erreurCoutGestion} onReessayer={chargerCoutGestion} />}
            {!chargementCoutGestion && !erreurCoutGestion && coutGestion && <CoutGestionCard cout={coutGestion} />}

            {chargementComptes && <SkeletonTexte lignes={2} />}
            {erreurComptes && <EtatErreur message={erreurComptes} onReessayer={chargerComptes} />}
            {!chargementComptes && !erreurComptes && comptes && comptes.a_des_comptes_annotes && (
              <Card title="Répartition par compte">
                <ul className="divide-y divide-bordure">
                  {comptes.items.map((item) => (
                    <li key={item.compte} className="flex items-center justify-between py-2 text-sm">
                      <span className="text-texte">{item.compte}</span>
                      <span className="font-medium text-texte">
                        {formatEuro(item.valeur, 0, montantsMasques)} · {item.pourcentage}%
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-xs text-texte-attenue">{comptes.pas_de_rentabilite_par_compte}</p>
              </Card>
            )}
          </Disclosure>

          {modal && <CompositionModal type={modal.type} categorie={modal.categorie} onClose={() => setModal(null)} />}
        </>
      )}
    </div>
  )
}
