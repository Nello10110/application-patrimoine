import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { PatrimoineNet } from '../api/types'
import { usePreferencesAffichage } from '../hooks/usePreferencesAffichage'
import { formatEuro } from '../utils/format'
import Card from './Card'
import EtatErreur from './EtatErreur'
import { SkeletonTexte } from './Skeleton'
import StatTile from './StatTile'

// Lentille (backlog 2.K.3) : quelle valeur devient la tuile principale, avec son
// libellé et son ton — Net reste le comportement d'origine (tone "good", c'est LE
// chiffre qui répond à "est-ce que ça monte ?"), Brut/Financier restent neutres
// (pas de jugement, ce sont des sous-totaux).
const TUILE_PRINCIPALE = {
  net: (p: PatrimoineNet) => ({ label: 'Patrimoine net', valeur: p.patrimoine_net, tone: 'good' as const }),
  brut: (p: PatrimoineNet) => ({ label: 'Patrimoine brut', valeur: p.actifs_totaux, tone: 'neutral' as const }),
  financier: (p: PatrimoineNet) => ({ label: 'Patrimoine financier', valeur: p.patrimoine_financier, tone: 'neutral' as const }),
}

/** Patrimoine net global (roadmap Phase 1) — actifs (portefeuille financier +
 * immobilier/SCPI/assurance-vie/PER) moins passifs (emprunts). Carte autonome,
 * indépendante de l'année sélectionnée et du reste du tableau de bord (comme
 * `PerformanceCard`) : chargée et affichée même si l'analyse géo/sectorielle
 * échoue, puisqu'elle ne dépend d'aucune des deux. */
export default function PatrimoineNetCard() {
  const [patrimoine, setPatrimoine] = useState<PatrimoineNet | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { lentille, montantsMasques, detenteurId } = usePreferencesAffichage()

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

  return (
    <Card title="Patrimoine net">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatTile label="Actifs totaux" value={formatEuro(patrimoine.actifs_totaux, 0, montantsMasques)} />
        <StatTile
          label="Passifs (emprunts)"
          value={formatEuro(patrimoine.passifs_totaux, 0, montantsMasques)}
          tone={patrimoine.passifs_totaux > 0 ? 'warning' : 'neutral'}
        />
        <StatTile label={principale.label} value={formatEuro(principale.valeur, 0, montantsMasques)} tone={principale.tone} />
      </div>

      {patrimoine.repartition_par_classe.length > 0 && (
        <ul className="mt-4 divide-y divide-bordure border-t border-bordure pt-2">
          {patrimoine.repartition_par_classe.map((item) => (
            <li key={item.categorie} className="flex items-center justify-between py-1.5 text-sm">
              <span className="text-texte">{item.categorie}</span>
              <span className="font-medium text-texte">{formatEuro(item.valeur, 0, montantsMasques)}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
