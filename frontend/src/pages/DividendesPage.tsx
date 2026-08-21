import { useEffect, useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { api } from '../api/client'
import type { DividendeMois } from '../api/types'
import Card from '../components/Card'
import { usePreferencesAffichage } from '../hooks/usePreferencesAffichage'
import { COULEUR_AXE, COULEUR_GRILLE, STYLE_INFOBULLE, STYLE_TICK_AXE } from '../utils/chartTheme'
import { formatDate, formatEuro } from '../utils/format'

function libelleMois(mois: string): string {
  const [annee, m] = mois.split('-')
  const date = new Date(Number(annee), Number(m) - 1, 1)
  const libelle = date.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
  return libelle.charAt(0).toUpperCase() + libelle.slice(1)
}

function MoisCard({ mois }: { mois: DividendeMois }) {
  const { montantsMasques } = usePreferencesAffichage()
  const [ouvert, setOuvert] = useState(false)

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700">
      <button
        type="button"
        onClick={() => setOuvert((v) => !v)}
        aria-expanded={ouvert}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
      >
        <span className="text-sm font-medium text-slate-900 dark:text-slate-100">{libelleMois(mois.mois)}</span>
        <span className="flex items-center gap-3">
          <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">{formatEuro(mois.montant_total, 2, montantsMasques)}</span>
          <span className="text-slate-400" aria-hidden="true">
            {ouvert ? '▲' : '▼'}
          </span>
        </span>
      </button>
      {ouvert && (
        <table className="w-full border-t border-slate-100 text-sm dark:border-slate-700">
          <tbody>
            {mois.lignes.map((ligne, i) => (
              <tr key={i} className="border-b border-slate-50 last:border-0 dark:border-slate-800">
                <td className="px-4 py-2 text-slate-500 dark:text-slate-400">{formatDate(ligne.date)}</td>
                <td className="px-4 py-2 text-slate-700 dark:text-slate-300">{ligne.nom ?? ligne.symbol ?? '—'}</td>
                <td className="px-4 py-2 text-right font-medium text-slate-900 dark:text-slate-100">{formatEuro(ligne.montant, 2, montantsMasques)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

export default function DividendesPage() {
  const { montantsMasques } = usePreferencesAffichage()
  const [calendrier, setCalendrier] = useState<DividendeMois[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .getDividendCalendar()
      .then(setCalendrier)
      .catch((err) => setError(err.message))
  }, [])

  if (error) return <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
  if (!calendrier) return <p className="text-sm text-slate-500 dark:text-slate-400">Chargement...</p>

  const total = calendrier.reduce((acc, m) => acc + m.montant_total, 0)
  const donneesGraphique = calendrier.map((m) => ({ mois: libelleMois(m.mois), montant: m.montant_total }))
  const hauteurGraphique = Math.max(220, donneesGraphique.length * 32)

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Dividendes</h2>

      {calendrier.length === 0 ? (
        <Card>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Aucun dividende perçu pour l'instant sur les transactions importées.
          </p>
        </Card>
      ) : (
        <>
          <Card title="Total perçu">
            <p className="text-3xl font-semibold text-emerald-600 dark:text-emerald-400">{formatEuro(total, 2, montantsMasques)}</p>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              sur {calendrier.length} mois, du {libelleMois(calendrier[0].mois)} au {libelleMois(calendrier[calendrier.length - 1].mois)}
            </p>
          </Card>

          <Card title="Par mois">
            <ResponsiveContainer width="100%" height={hauteurGraphique}>
              <BarChart data={donneesGraphique} layout="vertical" margin={{ left: 24, right: 24 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={COULEUR_GRILLE} />
                <XAxis type="number" stroke={COULEUR_AXE} tick={STYLE_TICK_AXE} tickFormatter={(v) => formatEuro(v, 0, montantsMasques)} />
                <YAxis type="category" dataKey="mois" width={130} tick={{ fontSize: 12, ...STYLE_TICK_AXE }} stroke={COULEUR_AXE} />
                <Tooltip formatter={(value) => formatEuro(Number(value), 2, montantsMasques)} {...STYLE_INFOBULLE} />
                <Bar dataKey="montant" fill="#10b981" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>

          <Card title="Détail">
            <div className="space-y-2">
              {[...calendrier].reverse().map((mois) => (
                <MoisCard key={mois.mois} mois={mois} />
              ))}
            </div>
          </Card>
        </>
      )}
    </div>
  )
}
