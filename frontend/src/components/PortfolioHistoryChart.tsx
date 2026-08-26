import { useMemo, useState } from 'react'
import { Area, AreaChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { PatrimoineHistoryPoint, PortfolioHistoryPoint } from '../api/types'
import Card from './Card'
import EtatErreur from './EtatErreur'
import EtatVide from './EtatVide'
import { SkeletonGraphique } from './Skeleton'
import { usePreferencesAffichage } from '../hooks/usePreferencesAffichage'
import { formatEuro } from '../utils/format'
import { bornesPeriode } from '../utils/periode'
import { COULEUR_AXE, COULEUR_GRILLE, STYLE_INFOBULLE, STYLE_TICK_AXE } from '../utils/chartTheme'

interface PortfolioHistoryChartProps {
  /** `null` tant que le chargement n'a pas abouti (cf. `loading`) — remonté par
   * `DashboardPage` (backlog 2.K.6) plutôt que chargé ici : partagé avec
   * `PatrimoineNetCard` pour la variation affichée sur le chiffre principal, un
   * seul appel réseau pour les deux (l'endpoint est coûteux, jusqu'à une minute).
   * Portefeuille FINANCIER seul — utilisé en lentille "financier". */
  points: PortfolioHistoryPoint[] | null
  loading: boolean
  error: string | null
  onRetry: () => void
  /** Historique combiné financier + immobilier/épargne − emprunts (feature Net/Brut/
   * Financier sur toute la page Synthèse) — utilisé en lentille "brut"/"net". Même
   * partage réseau que `points` ci-dessus (remonté par `DashboardPage`). */
  pointsPatrimoine?: PatrimoineHistoryPoint[] | null
  loadingPatrimoine?: boolean
  errorPatrimoine?: string | null
  onRetryPatrimoine?: () => void
}

export default function PortfolioHistoryChart({
  points,
  loading,
  error,
  onRetry,
  pointsPatrimoine,
  loadingPatrimoine,
  errorPatrimoine,
  onRetryPatrimoine,
}: PortfolioHistoryChartProps) {
  const { lentille, montantsMasques, periode } = usePreferencesAffichage()
  const [stacked, setStacked] = useState(false)
  const enFinancier = lentille === 'financier'

  // Hors lentille "financier" : la courbe vient de l'historique combiné, projeté sur
  // la même forme que `PortfolioHistoryPoint` — `valeur_investie`/`valeur_realisee_cumulee`
  // à 0, jamais lues dans ce cas (`stackedEffectif` ci-dessous force le mode ligne
  // simple, pas de décomposition Investi/Gains pour l'immobilier/l'épargne, qui n'ont
  // pas de grand livre de versements équivalent).
  const pointsActifs = enFinancier
    ? points
    : (pointsPatrimoine?.map((p) => ({
        date: p.date,
        valeur_portefeuille: lentille === 'brut' ? p.actifs_totaux : p.patrimoine_net,
        valeur_investie: 0,
        valeur_realisee_cumulee: 0,
      })) ?? null)
  const loadingActif = enFinancier ? loading : (loadingPatrimoine ?? false)
  const errorActif = enFinancier ? error : (errorPatrimoine ?? null)
  const onRetryActif = enFinancier ? onRetry : (onRetryPatrimoine ?? (() => {}))
  const stackedEffectif = stacked && enFinancier

  // Filtrage par la Période transverse (backlog 2.K.3), calculé côté client sur la
  // série complète déjà reçue en un seul appel (`getPortfolioHistory` ne prend
  // aucun paramètre de période, cf. plan — inchangé ici).
  const filtered = useMemo(() => {
    if (!pointsActifs) return []
    const bornes = bornesPeriode(periode)
    if (!bornes) return pointsActifs
    return pointsActifs.filter((p) => p.date >= bornes.dateDebut && p.date <= bornes.dateFin)
  }, [pointsActifs, periode])

  const data = useMemo(
    () =>
      filtered.map((p) => ({
        date: p.date,
        Portefeuille: p.valeur_portefeuille,
        Investi: p.valeur_investie,
        // Inclut le produit des ventes réalisées + dividendes + intérêts perçus, pas
        // seulement la valeur de marché actuelle — sans quoi ce total ne recoupait pas
        // celui de la carte Rentabilité globale (cf. `valeur_realisee_cumulee`, backend).
        Gains: p.valeur_portefeuille + p.valeur_realisee_cumulee - p.valeur_investie,
      })),
    [filtered],
  )

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-texte-attenue">Évolution du portefeuille</h2>
        <label className={`flex items-center gap-1.5 text-xs ${enFinancier ? 'text-texte' : 'text-texte-attenue'}`}>
          <input type="checkbox" checked={stackedEffectif} disabled={!enFinancier} onChange={(e) => setStacked(e.target.checked)} />
          Mode étagé (investi + gains)
        </label>
      </div>

      {!enFinancier && (
        <p className="mb-2 text-xs text-texte-attenue">
          Mode étagé non disponible hors vue Financier : pas de suivi investi/gains pour l'immobilier et l'épargne.
        </p>
      )}

      {stackedEffectif && (
        <p className="mb-2 text-xs text-texte-attenue">
          « Gains » inclut les ventes réalisées, dividendes et intérêts perçus — même chiffre que le
          Gain/Perte total de la carte Rentabilité globale.
        </p>
      )}

      {loadingActif && (
        <>
          <p className="mb-2 text-sm text-texte-attenue">
            Calcul de l'historique en cours (peut prendre jusqu'à une minute, une seule fois)...
          </p>
          <SkeletonGraphique />
        </>
      )}
      {errorActif && <EtatErreur message={errorActif} onReessayer={onRetryActif} />}
      {!loadingActif && !errorActif && data.length === 0 && <EtatVide titre="Pas encore d'historique disponible." />}

      {!loadingActif && !errorActif && data.length > 0 && (
        <ResponsiveContainer width="100%" height={280}>
          {stackedEffectif ? (
            <AreaChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke={COULEUR_GRILLE} />
              <XAxis dataKey="date" tick={{ fontSize: 11, ...STYLE_TICK_AXE }} minTickGap={40} stroke={COULEUR_AXE} />
              <YAxis tickFormatter={(v) => formatEuro(Number(v), 0, montantsMasques)} width={80} tick={{ fontSize: 11, ...STYLE_TICK_AXE }} stroke={COULEUR_AXE} />
              <Tooltip formatter={(value) => formatEuro(Number(value), 0, montantsMasques)} {...STYLE_INFOBULLE} />
              <Area type="monotone" dataKey="Investi" stackId="1" stroke="#94a3b8" fill="#cbd5e1" />
              <Area type="monotone" dataKey="Gains" stackId="1" stroke="#16a34a" fill="#86efac" />
            </AreaChart>
          ) : (
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke={COULEUR_GRILLE} />
              <XAxis dataKey="date" tick={{ fontSize: 11, ...STYLE_TICK_AXE }} minTickGap={40} stroke={COULEUR_AXE} />
              <YAxis tickFormatter={(v) => formatEuro(Number(v), 0, montantsMasques)} width={80} tick={{ fontSize: 11, ...STYLE_TICK_AXE }} stroke={COULEUR_AXE} />
              <Tooltip formatter={(value) => formatEuro(Number(value), 0, montantsMasques)} {...STYLE_INFOBULLE} />
              <Line type="monotone" dataKey="Portefeuille" stroke="#2563eb" dot={false} strokeWidth={2} />
            </LineChart>
          )}
        </ResponsiveContainer>
      )}
    </Card>
  )
}
