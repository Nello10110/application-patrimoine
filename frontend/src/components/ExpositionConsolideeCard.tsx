import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { ExpositionConsolidee } from '../api/types'
import Card from './Card'
import EtatErreur from './EtatErreur'
import EtatVide from './EtatVide'
import PieChartCard from './PieChartCard'
import StatTile from './StatTile'
import { SkeletonGraphique } from './Skeleton'
import { usePreferencesAffichage } from '../hooks/usePreferencesAffichage'
import { formatEuro } from '../utils/format'

/** Exposition consolidée tous actifs (backlog 2.P.1) : une seule répartition
 * géo/classe, financier ET immobilier/épargne confondus — jamais servie ailleurs
 * dans l'application (`AnalysisResponse` reste scopé au seul portefeuille
 * financier). Affichée dans le détail repliable du Tableau de bord. */
export default function ExpositionConsolideeCard() {
  const { montantsMasques } = usePreferencesAffichage()
  const [donnees, setDonnees] = useState<ExpositionConsolidee | null>(null)
  const [loading, setLoading] = useState(true)
  const [erreur, setErreur] = useState<string | null>(null)

  function charger() {
    setLoading(true)
    setErreur(null)
    api
      .getExpositionConsolidee()
      .then(setDonnees)
      .catch((err) => setErreur((err as Error).message))
      .finally(() => setLoading(false))
  }

  useEffect(charger, [])

  return (
    <div>
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-texte-attenue">
        Exposition consolidée — tous actifs
      </h3>

      {loading && <SkeletonGraphique hauteur={320} />}
      {erreur && <EtatErreur message={erreur} onReessayer={charger} />}

      {!loading && !erreur && donnees && (
        <div className="space-y-4">
          {donnees.valeur_totale === 0 ? (
            <Card>
              <EtatVide titre="Aucun actif valorisé." description="Importe un historique de transactions ou renseigne un actif manuellement pour voir l'exposition consolidée." />
            </Card>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <StatTile
                  label="Plus grosse ligne"
                  value={donnees.plus_grosse_ligne_ticker ?? '—'}
                  sub={donnees.plus_grosse_ligne_pct !== null ? `${donnees.plus_grosse_ligne_pct}% du patrimoine` : undefined}
                />
                <StatTile
                  label="Top 5 lignes"
                  value={donnees.top5_lignes_pct !== null ? `${donnees.top5_lignes_pct}%` : '—'}
                  sub="du patrimoine total"
                />
                <StatTile
                  label="Première zone géographique"
                  value={donnees.premiere_zone_geo ?? '—'}
                  sub={donnees.premiere_zone_geo_pct !== null ? `${donnees.premiere_zone_geo_pct}% du patrimoine` : undefined}
                />
              </div>

              {/* `repartition_geo`/`repartition_classe` sont déjà nettées des emprunts
                  rattachés côté backend, et n'incluent jamais de catégorie à valeur <= 0
                  (`compute_exposition_consolidee` les exclut — pas de liste ici, contrairement
                  à `PatrimoineNetCard`, pour afficher une équité négative en repli). */}
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <PieChartCard
                  title="Répartition géographique consolidée"
                  items={donnees.repartition_geo.map((i) => ({ categorie: i.categorie, poids: i.valeur / donnees.valeur_totale }))}
                />
                <PieChartCard
                  title="Répartition par classe d'actif"
                  items={donnees.repartition_classe.map((i) => ({ categorie: i.categorie, poids: i.valeur / donnees.valeur_totale }))}
                />
              </div>

              <p className="text-xs text-texte-attenue">
                Valeur totale consolidée (nette des emprunts rattachés à chaque actif) :{' '}
                {formatEuro(donnees.valeur_totale, 0, montantsMasques)}.{' '}
                {donnees.part_estimee_manuelle_pct > 0 &&
                  `${donnees.part_estimee_manuelle_pct}% de cette valeur (immobilier/épargne saisis manuellement) a une zone géographique déclarée, pas mesurée.`}
              </p>
            </>
          )}
        </div>
      )}
    </div>
  )
}
