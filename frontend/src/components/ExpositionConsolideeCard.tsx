import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { ExpositionConsolidee } from '../api/types'
import Card from './Card'
import CompositionModal from './CompositionModal'
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
 * financier). Affichée dans le détail repliable du Tableau de bord.
 *
 * Suit la lentille Net/Brut/Financier (backlog 2.S.2, retour utilisateur 26/08/2026) :
 * Brut affiche la valeur brute de chaque ligne, Net la nette de son emprunt rattaché
 * (mêmes champs `_nette` que `PatrimoineNetCard`). En Financier, la carte est masquée
 * plutôt que de montrer une pseudo-exposition "tous actifs" restreinte au seul
 * financier — ce serait contradictoire avec son titre et redondant avec les cartes
 * Répartition géographique/sectorielle déjà financières juste au-dessus. */
export default function ExpositionConsolideeCard() {
  const { lentille, montantsMasques } = usePreferencesAffichage()
  const [donnees, setDonnees] = useState<ExpositionConsolidee | null>(null)
  const [loading, setLoading] = useState(true)
  const [erreur, setErreur] = useState<string | null>(null)
  const [modal, setModal] = useState<{ dimension: 'geo' | 'classe'; categorie: string } | null>(null)

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

  if (lentille === 'financier') return null

  const enNet = lentille === 'net'
  const valeurTotale = donnees ? (enNet ? donnees.valeur_totale_nette : donnees.valeur_totale) : 0
  const repartitionGeo = donnees ? (enNet ? donnees.repartition_geo_nette : donnees.repartition_geo) : []
  const repartitionClasse = donnees ? (enNet ? donnees.repartition_classe_nette : donnees.repartition_classe) : []
  const plusGrosseLigneTicker = donnees ? (enNet ? donnees.plus_grosse_ligne_ticker_nette : donnees.plus_grosse_ligne_ticker) : null
  const plusGrosseLignePct = donnees ? (enNet ? donnees.plus_grosse_ligne_pct_nette : donnees.plus_grosse_ligne_pct) : null
  const top5LignesPct = donnees ? (enNet ? donnees.top5_lignes_pct_nette : donnees.top5_lignes_pct) : null
  const premiereZoneGeo = donnees ? (enNet ? donnees.premiere_zone_geo_nette : donnees.premiere_zone_geo) : null
  const premiereZoneGeoPct = donnees ? (enNet ? donnees.premiere_zone_geo_pct_nette : donnees.premiere_zone_geo_pct) : null
  const partEstimeeManuellePct = donnees ? (enNet ? donnees.part_estimee_manuelle_pct_nette : donnees.part_estimee_manuelle_pct) : 0

  return (
    <div>
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-texte-attenue">
        Exposition consolidée — tous actifs
      </h3>

      {loading && <SkeletonGraphique hauteur={320} />}
      {erreur && <EtatErreur message={erreur} onReessayer={charger} />}

      {!loading && !erreur && donnees && (
        <div className="space-y-4">
          {valeurTotale === 0 ? (
            <Card>
              <EtatVide titre="Aucun actif valorisé." description="Importe un historique de transactions ou renseigne un actif manuellement pour voir l'exposition consolidée." />
            </Card>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <StatTile
                  label="Plus grosse ligne"
                  value={plusGrosseLigneTicker ?? '—'}
                  sub={plusGrosseLignePct !== null ? `${plusGrosseLignePct}% du patrimoine` : undefined}
                />
                <StatTile label="Top 5 lignes" value={top5LignesPct !== null ? `${top5LignesPct}%` : '—'} sub="du patrimoine total" />
                <StatTile
                  label="Première zone géographique"
                  value={premiereZoneGeo ?? '—'}
                  sub={premiereZoneGeoPct !== null ? `${premiereZoneGeoPct}% du patrimoine` : undefined}
                />
              </div>

              {/* `repartition_geo`/`repartition_classe` (et leurs variantes `_nette`)
                  n'incluent jamais de catégorie à valeur <= 0 (`compute_exposition_consolidee`
                  les exclut — pas de liste ici, contrairement à `PatrimoineNetCard`, pour
                  afficher une équité négative en repli). */}
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <PieChartCard
                  title="Répartition géographique consolidée"
                  items={repartitionGeo.map((i) => ({ categorie: i.categorie, poids: i.valeur / valeurTotale }))}
                  onCategoryClick={(categorie) => setModal({ dimension: 'geo', categorie })}
                />
                <PieChartCard
                  title="Répartition par classe d'actif"
                  items={repartitionClasse.map((i) => ({ categorie: i.categorie, poids: i.valeur / valeurTotale }))}
                  onCategoryClick={(categorie) => setModal({ dimension: 'classe', categorie })}
                />
              </div>

              <p className="text-xs text-texte-attenue">
                Valeur totale consolidée{enNet ? ' (nette des emprunts rattachés à chaque actif)' : ' (valeur brute)'} :{' '}
                {formatEuro(valeurTotale, 0, montantsMasques)}.{' '}
                {partEstimeeManuellePct > 0 &&
                  `${partEstimeeManuellePct}% de cette valeur (immobilier/épargne saisis manuellement) a une zone géographique déclarée, pas mesurée.`}
              </p>
            </>
          )}
        </div>
      )}

      {modal && (
        <CompositionModal
          categorie={modal.categorie}
          sousTitre={modal.dimension === 'geo' ? 'Répartition géographique consolidée' : "Répartition par classe d'actif"}
          fetchComposition={(categorie) => api.getExpositionConsolideeComposition(modal.dimension, categorie, enNet)}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  )
}
