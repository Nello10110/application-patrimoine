import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { AnalysisResponse } from '../api/types'
import Card from '../components/Card'
import { formatEuro } from '../utils/format'

const CURRENT_YEAR = new Date().getFullYear()

/** Détail des actions de rééquilibrage (alertes + recommandations), sorti du
 * Tableau de bord pour ne pas y encombrer la vue d'ensemble — celui-ci ne garde
 * qu'un indicateur résumé qui renvoie ici. Même source de données que le Tableau
 * de bord (`GET /api/analysis/{annee}`), avec son propre sélecteur d'année. */
export default function RecommandationsPage() {
  const [annee, setAnnee] = useState(CURRENT_YEAR)
  const [anneesDisponibles, setAnneesDisponibles] = useState<number[]>([CURRENT_YEAR])
  const [analysis, setAnalysis] = useState<AnalysisResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .listTargetYears()
      .then((annees) => {
        const ensemble = new Set([...annees, CURRENT_YEAR])
        setAnneesDisponibles(Array.from(ensemble).sort((a, b) => b - a))
      })
      .catch(() => {
        // Sélecteur dégradé à la seule année courante plutôt que bloquant.
      })
  }, [])

  useEffect(() => {
    setLoading(true)
    setError(null)
    api
      .getAnalysis(annee)
      .then(setAnalysis)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [annee])

  const hasNoHoldings = analysis ? analysis.risques.nombre_lignes === 0 : false
  const hasNoTargets = analysis
    ? analysis.geo.every((g) => g.pourcentage_cible === null) && analysis.sector.every((s) => s.pourcentage_cible === null)
    : false

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Rééquilibrage {annee}</h2>
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
      </div>

      {loading && <p className="text-sm text-slate-500 dark:text-slate-400">Chargement...</p>}
      {error && <p className="text-sm text-red-600 dark:text-red-400">Erreur: {error}</p>}

      {!loading && !error && analysis && (
        <>
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
        </>
      )}
    </div>
  )
}
