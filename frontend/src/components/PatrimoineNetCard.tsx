import { useEffect, useMemo, useState } from 'react'
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { api } from '../api/client'
import type { PatrimoineNet, PortfolioHistoryPoint } from '../api/types'
import { usePreferencesAffichage } from '../hooks/usePreferencesAffichage'
import { formatEuro } from '../utils/format'
import { bornesPeriode, libellePeriodeEcoulee, variationSurPeriode } from '../utils/periode'
import { STYLE_INFOBULLE } from '../utils/chartTheme'
import Card from './Card'
import EtatErreur from './EtatErreur'
import { SkeletonTexte } from './Skeleton'
import StatTile from './StatTile'

const COULEURS_CLASSE = ['#2563eb', '#7c3aed', '#0891b2', '#16a34a', '#ca8a04', '#dc2626', '#db2777', '#4b5563', '#0d9488', '#9333ea', '#ea580c']

// Lentille (backlog 2.K.3) : quelle valeur devient la tuile principale, avec son
// libellé et son ton — Net reste le comportement d'origine (tone "good", c'est LE
// chiffre qui répond à "est-ce que ça monte ?"), Brut/Financier restent neutres
// (pas de jugement, ce sont des sous-totaux).
const TUILE_PRINCIPALE = {
  net: (p: PatrimoineNet) => ({ label: 'Patrimoine net', valeur: p.patrimoine_net, tone: 'good' as const }),
  brut: (p: PatrimoineNet) => ({ label: 'Patrimoine brut', valeur: p.actifs_totaux, tone: 'neutral' as const }),
  financier: (p: PatrimoineNet) => ({ label: 'Patrimoine financier', valeur: p.patrimoine_financier, tone: 'neutral' as const }),
}

interface PatrimoineNetCardProps {
  /** Historique du portefeuille (backlog 2.K.6), remonté par `DashboardPage` — sert
   * uniquement à afficher une variation + phrase sous le chiffre principal. Mesure
   * le portefeuille FINANCIER suivi (courbe déjà affichée juste en dessous), pas le
   * patrimoine net lui-même (qui inclut aussi l'immobilier/l'épargne/les dettes,
   * sans historique daté consolidé disponible) — volontairement absent (`undefined`)
   * pour tout appelant hors tableau de bord : la variation ne s'affiche alors pas,
   * plutôt que d'afficher un chiffre dont la définition serait ambiguë hors contexte.
   */
  historiquePortefeuille?: { points: PortfolioHistoryPoint[] | null; loading: boolean }
}

/** Patrimoine net global (roadmap Phase 1) — actifs (portefeuille financier +
 * immobilier/SCPI/assurance-vie/PER) moins passifs (emprunts). Carte autonome,
 * indépendante de l'année sélectionnée et du reste du tableau de bord (comme
 * `PerformanceCard`) : chargée et affichée même si l'analyse géo/sectorielle
 * échoue, puisqu'elle ne dépend d'aucune des deux. */
export default function PatrimoineNetCard({ historiquePortefeuille }: PatrimoineNetCardProps = {}) {
  const [patrimoine, setPatrimoine] = useState<PatrimoineNet | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { lentille, montantsMasques, detenteurId, periode } = usePreferencesAffichage()

  // Variation + phrase en langage naturel (backlog 2.K.6) : calculée sur la même
  // série et le même filtrage de Période transverse que `PortfolioHistoryChart`
  // (mode ligne, jamais le mode étagé) — les deux composants doivent toujours
  // raconter la même histoire pour la même période.
  const variationPct = useMemo(() => {
    if (!historiquePortefeuille?.points) return null
    const bornes = bornesPeriode(periode)
    const filtres = bornes
      ? historiquePortefeuille.points.filter((p) => p.date >= bornes.dateDebut && p.date <= bornes.dateFin)
      : historiquePortefeuille.points
    return variationSurPeriode(filtres.map((p) => ({ valeur: p.valeur_portefeuille })))
  }, [historiquePortefeuille?.points, periode])

  function charger() {
    setLoading(true)
    setError(null)
    api
      .getPatrimoineNet(detenteurId)
      .then(setPatrimoine)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(charger, [detenteurId])

  if (loading) {
    return (
      <Card title="Patrimoine net">
        <SkeletonTexte lignes={3} />
      </Card>
    )
  }

  if (error) {
    return (
      <Card title="Patrimoine net">
        <EtatErreur message={error} onReessayer={charger} />
      </Card>
    )
  }

  // Rien à montrer tant qu'aucun actif n'a été ajouté nulle part (positions,
  // immobilier, épargne...) — pas de carte vide pour un portefeuille tout neuf.
  // Atteint désormais uniquement sur une vraie absence de données (backlog 2.K.5),
  // plus jamais sur un chargement ou un échec réseau (couverts ci-dessus).
  if (!patrimoine || (patrimoine.actifs_totaux === 0 && patrimoine.passifs_totaux === 0)) return null

  const principale = TUILE_PRINCIPALE[lentille](patrimoine)
  const toneClassPrincipale = { good: 'text-positif', warning: 'text-avertissement', neutral: 'text-texte' }[principale.tone]

  return (
    <Card title="Patrimoine net">
      {/* Le chiffre (backlog 2.K.6) : très grand, avec sa variation et une phrase en
          langage naturel — le premier temps de la hiérarchie de lecture du tableau
          de bord. */}
      <div className="mb-4">
        <p className="text-xs font-medium uppercase tracking-wide text-texte-attenue">{principale.label}</p>
        <p className={`text-display ${toneClassPrincipale}`}>{formatEuro(principale.valeur, 0, montantsMasques)}</p>
        {variationPct !== null && (
          <p className="mt-1 text-sm">
            <span className={variationPct >= 0 ? 'text-positif' : 'text-negatif'}>
              {variationPct >= 0 ? '+' : ''}
              {variationPct.toFixed(1)}%
            </span>{' '}
            <span className="text-texte-attenue">
              {libellePeriodeEcoulee(periode)} — portefeuille suivi, hors immobilier/épargne/dettes
            </span>
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatTile label="Actifs totaux" value={formatEuro(patrimoine.actifs_totaux, 0, montantsMasques)} />
        <StatTile
          label="Passifs (emprunts)"
          value={formatEuro(patrimoine.passifs_totaux, 0, montantsMasques)}
          tone={patrimoine.passifs_totaux > 0 ? 'warning' : 'neutral'}
        />
      </div>

      {patrimoine.repartition_par_classe.length > 0 && (
        <div className="mt-4 border-t border-bordure pt-2">
          <p className="pt-2 text-xs font-medium uppercase tracking-wide text-texte-attenue">Par type d'investissement</p>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart margin={{ top: 10, right: 10, bottom: 10, left: 10 }}>
              <Pie
                data={patrimoine.repartition_par_classe}
                dataKey="valeur"
                nameKey="categorie"
                cx="50%"
                cy="50%"
                outerRadius={80}
                label={(d) => `${((d.value / patrimoine.actifs_totaux) * 100).toFixed(0)}%`}
              >
                {patrimoine.repartition_par_classe.map((_, i) => (
                  <Cell key={i} fill={COULEURS_CLASSE[i % COULEURS_CLASSE.length]} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value, _name, item) => [
                  `${formatEuro(Number(value), 0, montantsMasques)} (${((Number(value) / patrimoine.actifs_totaux) * 100).toFixed(1)}%)`,
                  item?.payload?.categorie,
                ]}
                {...STYLE_INFOBULLE}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
          <ul className="divide-y divide-bordure border-t border-bordure pt-2">
            {patrimoine.repartition_par_classe.map((item) => (
              <li key={item.categorie} className="flex items-center justify-between py-1.5 text-sm">
                <span className="text-texte">{item.categorie}</span>
                <span className="font-medium text-texte">{formatEuro(item.valeur, 0, montantsMasques)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  )
}
