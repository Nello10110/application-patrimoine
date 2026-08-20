import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { RapportMensuel } from '../api/types'
import Card from '../components/Card'
import { formatDate, formatEuro, formatPct } from '../utils/format'

function moisCourant(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function libelleMois(annee: number, mois: number): string {
  const date = new Date(annee, mois - 1, 1)
  const libelle = date.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
  return libelle.charAt(0).toUpperCase() + libelle.slice(1)
}

export default function RapportPage() {
  const [moisSelectionne, setMoisSelectionne] = useState(moisCourant())
  const [rapport, setRapport] = useState<RapportMensuel | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const [annee, mois] = moisSelectionne.split('-').map(Number)
    setLoading(true)
    setError(null)
    api
      .getRapportMensuel(annee, mois)
      .then(setRapport)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [moisSelectionne])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Rapport mensuel</h2>
        <input
          type="month"
          value={moisSelectionne}
          max={moisCourant()}
          onChange={(e) => setMoisSelectionne(e.target.value)}
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
        />
      </div>

      {loading && <p className="text-sm text-slate-500 dark:text-slate-400">Chargement...</p>}
      {error && <p className="text-sm text-red-600 dark:text-red-400">Erreur: {error}</p>}

      {rapport && !loading && (
        <>
          <h3 className="text-sm text-slate-500 dark:text-slate-400">{libelleMois(rapport.annee, rapport.mois)}</h3>

          {rapport.nombre_transactions === 0 && rapport.valeur_debut_mois === null ? (
            <Card>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Aucune donnée disponible pour ce mois (aucune transaction, portefeuille pas encore constitué à cette date).
              </p>
            </Card>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Card title="Valeur en fin de mois">
                  <p className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
                    {rapport.valeur_fin_mois !== null ? formatEuro(rapport.valeur_fin_mois, 0) : '—'}
                  </p>
                </Card>
                <Card title="Évolution sur le mois">
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

              <Card title="Plus gros mouvements du mois">
                {rapport.plus_gros_mouvements.length === 0 ? (
                  <p className="text-sm text-slate-500 dark:text-slate-400">Aucun mouvement ce mois-ci.</p>
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
