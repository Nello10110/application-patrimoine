import { useEffect, useMemo, useState } from 'react'
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { api } from '../api/client'
import type { PatrimoineHistoryPoint, PatrimoineNet, PortfolioHistoryPoint } from '../api/types'
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

// Légende sous le chiffre principal, une par lentille (feature Net/Brut/Financier sur
// toute la page Synthèse) — la même honnêteté que partout ailleurs dans le projet sur
// la portée réelle de la donnée affichée.
const LEGENDE_VARIATION = {
  financier: 'portefeuille suivi, hors immobilier/épargne/dettes',
  brut: "patrimoine brut suivi — immobilier/épargne valorisés à leurs derniers points connus, parfois espacés",
  net: "patrimoine net suivi — immobilier/épargne valorisés à leurs derniers points connus, parfois espacés",
}

interface PatrimoineNetCardProps {
  /** Historique du PORTEFEUILLE FINANCIER (backlog 2.K.6), remonté par
   * `DashboardPage` — sert à la variation + phrase sous le chiffre principal
   * UNIQUEMENT en lentille "financier". Volontairement absent (`undefined`) pour
   * tout appelant hors tableau de bord : la variation ne s'affiche alors pas, plutôt
   * que d'afficher un chiffre dont la définition serait ambiguë hors contexte.
   */
  historiquePortefeuille?: { points: PortfolioHistoryPoint[] | null; loading: boolean }
  /** Historique combiné financier + immobilier/épargne − emprunts (feature Net/Brut/
   * Financier sur toute la page Synthèse) — sert à la variation en lentille "brut"/
   * "net". Cf. `patrimoine_history_service` pour les limites assumées (données
   * manuelles clairsemées, ratio flou pour le scoping détenteur de la poche
   * financière). */
  historiquePatrimoine?: { points: PatrimoineHistoryPoint[] | null; loading: boolean }
}

/** Patrimoine net global (roadmap Phase 1) — actifs (portefeuille financier +
 * immobilier/SCPI/assurance-vie/PER) moins passifs (emprunts). Carte autonome,
 * indépendante de l'année sélectionnée et du reste du tableau de bord (comme
 * `PerformanceCard`) : chargée et affichée même si l'analyse géo/sectorielle
 * échoue, puisqu'elle ne dépend d'aucune des deux. */
export default function PatrimoineNetCard({ historiquePortefeuille, historiquePatrimoine }: PatrimoineNetCardProps = {}) {
  const [patrimoine, setPatrimoine] = useState<PatrimoineNet | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { lentille, montantsMasques, detenteurId, periode } = usePreferencesAffichage()

  // Variation + phrase en langage naturel (backlog 2.K.6) : calculée sur la même
  // série et le même filtrage de Période transverse que `PortfolioHistoryChart`
  // (mode ligne, jamais le mode étagé) — les deux composants doivent toujours
  // raconter la même histoire pour la même période. Source différente selon la
  // lentille (feature Net/Brut/Financier sur toute la page Synthèse) : le
  // portefeuille financier seul en "financier", l'historique combiné en "brut"/"net".
  const variationPct = useMemo(() => {
    const source =
      lentille === 'financier'
        ? historiquePortefeuille?.points?.map((p) => ({ date: p.date, valeur: p.valeur_portefeuille }))
        : historiquePatrimoine?.points?.map((p) => ({ date: p.date, valeur: lentille === 'brut' ? p.actifs_totaux : p.patrimoine_net }))
    if (!source) return null
    const bornes = bornesPeriode(periode)
    const filtres = bornes ? source.filter((p) => p.date >= bornes.dateDebut && p.date <= bornes.dateFin) : source
    return variationSurPeriode(filtres)
  }, [lentille, historiquePortefeuille?.points, historiquePatrimoine?.points, periode])

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

  // Camembert/liste (feature Net/Brut/Financier sur toute la page Synthèse) : en
  // lentille "financier", filtre aux seules catégories financières (champ dédié côté
  // backend, cf. `compute_patrimoine_net`) — "brut"/"net" restent tous-actifs, comme
  // avant cette feature.
  const repartitionAffichee = lentille === 'financier' ? patrimoine.repartition_par_classe_financiere : patrimoine.repartition_par_classe
  const totalRepartition = lentille === 'financier' ? patrimoine.patrimoine_financier : patrimoine.actifs_totaux

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
              {libellePeriodeEcoulee(periode)} — {LEGENDE_VARIATION[lentille]}
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

      {repartitionAffichee.length > 0 && (
        <div className="mt-4 border-t border-bordure pt-2">
          <p className="pt-2 text-xs font-medium uppercase tracking-wide text-texte-attenue">Par type d'investissement</p>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart margin={{ top: 10, right: 10, bottom: 10, left: 10 }}>
              <Pie
                data={repartitionAffichee}
                dataKey="valeur"
                nameKey="categorie"
                cx="50%"
                cy="50%"
                outerRadius={80}
                label={(d) => `${((d.value / totalRepartition) * 100).toFixed(0)}%`}
              >
                {repartitionAffichee.map((_, i) => (
                  <Cell key={i} fill={COULEURS_CLASSE[i % COULEURS_CLASSE.length]} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value, _name, item) => [
                  `${formatEuro(Number(value), 0, montantsMasques)} (${((Number(value) / totalRepartition) * 100).toFixed(1)}%)`,
                  item?.payload?.categorie,
                ]}
                {...STYLE_INFOBULLE}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
          <ul className="divide-y divide-bordure border-t border-bordure pt-2">
            {repartitionAffichee.map((item) => (
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
