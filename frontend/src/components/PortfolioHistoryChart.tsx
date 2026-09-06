import { useEffect, useMemo, useState } from 'react'
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { PatrimoineHistoryPoint, PortfolioHistoryPoint } from '../api/types'
import { Pill, SegmentedControl } from './Controls'
import EtatErreur from './EtatErreur'
import EtatVide from './EtatVide'
import { SkeletonGraphique } from './Skeleton'
import { usePreferencesAffichage } from '../hooks/usePreferencesAffichage'
import { formatDate, formatEuro } from '../utils/format'
import { PERIODES_RELATIVES, bornesPeriode } from '../utils/periode'
import { STYLE_INFOBULLE } from '../utils/chartTheme'

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
  const { lentille, montantsMasques, periode, setPeriode } = usePreferencesAffichage()
  const [stacked, setStacked] = useState(false)

  // Migration d'une préférence dont l'interface a disparu : le sélecteur de période
  // de la barre du haut proposait « Personnalisée… » avec deux champs de date, que la
  // refonte ne reprend pas ici (1 mois → Tout, cf. maquette ; le Rapport, lui, garde
  // ses propres bornes personnalisées). Sans cette remise à zéro, un foyer qui avait
  // enregistré une plage personnalisée verrait le graphique filtré dessus alors que la
  // pilule affichée annoncerait « Tout » — exactement le genre d'incohérence que cette
  // refonte doit supprimer.
  useEffect(() => {
    if (periode.type === 'personnalisee') setPeriode({ type: 'relative', valeur: 'TOUT' })
  }, [periode, setPeriode])
  const enFinancier = lentille === 'financier'

  // Hors lentille "financier" : la courbe vient de l'historique combiné, projeté sur
  // la même forme que `PortfolioHistoryPoint` — `valeur_investie`/`valeur_realisee_cumulee`
  // sont désormais de vrais champs calculés côté backend (backlog § U.4, 30/08/2026) :
  // la part manuelle de l'investi ne progresse qu'aux points où un versement a été
  // explicitement déclaré (§ U.2), le reste de la hausse restant du gain.
  //
  // En lentille Net, `valeur_investie` (toujours BRUTE) doit céder la place à
  // `valeur_investie_nette` (retour utilisateur 31/08/2026) : comparer un
  // `patrimoine_net` déjà netté de l'emprunt à un investi resté brut soustrayait la
  // dette deux fois, sous-comptant massivement les gains d'un bien financé à crédit
  // (ex. maison à 300k€ avec 250k€ de crédit restant dû affichait ~50k€ de "gains"
  // fictifs). `valeur_investie_nette` restaure l'invariant : Gains doit valoir le même
  // montant en Brut et en Net, la dette ne déplaçant jamais une performance
  // d'investissement, seulement le capital investi affiché.
  const pointsActifs = enFinancier
    ? points
    : (pointsPatrimoine?.map((p) => ({
        date: p.date,
        valeur_portefeuille: lentille === 'brut' ? p.actifs_totaux : p.patrimoine_net,
        valeur_investie: lentille === 'brut' ? p.valeur_investie : p.valeur_investie_nette,
        valeur_realisee_cumulee: p.valeur_realisee_cumulee,
      })) ?? null)
  const loadingActif = enFinancier ? loading : (loadingPatrimoine ?? false)
  const errorActif = enFinancier ? error : (errorPatrimoine ?? null)
  const onRetryActif = enFinancier ? onRetry : (onRetryPatrimoine ?? (() => {}))
  const stackedEffectif = stacked

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

  // Cinq repères d'axe sous la courbe (maquette de la refonte) plutôt que les axes
  // complets de Recharts : la courbe raconte une forme, pas des valeurs précises —
  // celles-ci s'obtiennent à l'infobulle, au survol du point voulu.
  const reperesAxe = useMemo(() => {
    if (data.length === 0) return []
    const pas = (data.length - 1) / 4
    return Array.from({ length: 5 }, (_, i) => {
      const point = data[Math.round(i * pas)]
      return point ? formatDate(point.date) : ''
    })
  }, [data])

  return (
    <>
      <div className="mb-2 flex flex-wrap items-center justify-end gap-2">
        {stackedEffectif && (
          <div className="mr-auto flex gap-3 text-[11px] text-ink3">
            <span className="flex items-center gap-1.5">
              <span aria-hidden className="h-2 w-2 rounded-[3px] bg-s4" />
              Investi
            </span>
            <span className="flex items-center gap-1.5">
              <span aria-hidden className="h-2 w-2 rounded-[3px] bg-accent" />
              Gains
            </span>
          </div>
        )}
        <Pill
          actif={stackedEffectif}
          onClick={() => setStacked(!stackedEffectif)}
          title="Superpose l'investi sous le total : la tranche visible entre les deux courbes, ce sont les gains."
        >
          Mode étagé
        </Pill>
        {/* La période vit à CÔTÉ de la courbe qu'elle change (deuxième décision
            structurelle du paquet de design). Elle reste la préférence transverse et
            non un état local : le chiffre héros juste au-dessus affiche sa variation
            sur cette même période, les deux doivent raconter la même histoire.
            Sous 768 px, elle passe SOUS la courbe, à portée du pouce — cf. l'ordre
            flex plus bas. */}
        <SegmentedControl
          options={PERIODES_RELATIVES.map((p) => ({ valeur: p.valeur, libelle: p.label }))}
          valeur={periode.type === 'relative' ? periode.valeur : 'TOUT'}
          onChange={(valeur) => setPeriode({ type: 'relative', valeur })}
          taille="sm"
          ariaLabel="Période du graphique"
          className="hidden md:flex"
        />
      </div>

      {loadingActif && (
        <>
          <p className="mb-2 text-[13px] text-ink3">
            Calcul de l'historique en cours (peut prendre jusqu'à une minute, une seule fois)...
          </p>
          <SkeletonGraphique />
        </>
      )}
      {errorActif && <EtatErreur message={errorActif} onReessayer={onRetryActif} />}
      {!loadingActif && !errorActif && data.length === 0 && <EtatVide titre="Pas encore d'historique disponible." />}

      {!loadingActif && !errorActif && data.length > 0 && (
        <>
          {/* Langage graphique de la refonte : un trait d'accent de 2,5 px et son aire
              dégradée, sans grille ni axes dessinés. Les axes de Recharts sont
              conservés mais MASQUÉS (`hide`) : ils calculent toujours l'échelle, ils
              ne l'affichent plus. */}
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="aireHero" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.34} />
                  <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="date" hide />
              <YAxis hide domain={['dataMin', 'dataMax']} />
              <Tooltip
                formatter={(value, nom) => [formatEuro(Number(value), 0, montantsMasques), nom]}
                labelFormatter={(date) => formatDate(String(date))}
                {...STYLE_INFOBULLE}
              />
              <Area
                type="monotone"
                dataKey="Portefeuille"
                stroke="var(--accent)"
                strokeWidth={2.5}
                fill="url(#aireHero)"
                isAnimationActive={false}
              />
              {/* Mode étagé : l'investi par-dessus l'aire du total, depuis la même
                  ligne de base — la tranche visible entre les deux courbes, ce sont
                  les gains. */}
              {stackedEffectif && (
                <Area
                  type="monotone"
                  dataKey="Investi"
                  stroke="var(--s3)"
                  strokeWidth={1.5}
                  strokeDasharray="5 4"
                  fill="var(--s4)"
                  fillOpacity={0.55}
                  isAnimationActive={false}
                />
              )}
            </AreaChart>
          </ResponsiveContainer>

          <div className="flex justify-between pt-0.5 text-[11px] text-ink4">
            {reperesAxe.map((libelle, i) => (
              <span key={`${libelle}-${i}`}>{libelle}</span>
            ))}
          </div>

          {/* Mobile : la période sous la courbe, sur toute la largeur (maquette). */}
          <SegmentedControl
            options={PERIODES_RELATIVES.map((p) => ({ valeur: p.valeur, libelle: p.label }))}
            valeur={periode.type === 'relative' ? periode.valeur : 'TOUT'}
            onChange={(valeur) => setPeriode({ type: 'relative', valeur })}
            taille="sm"
            ariaLabel="Période du graphique (mobile)"
            className="mt-3 md:hidden"
          />

          {stackedEffectif && (
            <p className="mt-2 text-[11px] text-ink4">
              {enFinancier
                ? "« Gains » inclut les ventes réalisées, dividendes et intérêts perçus — même chiffre que le Gain/Perte total de la carte Rentabilité globale."
                : "Pour l'immobilier/l'épargne, seul un versement explicitement déclaré compte comme « Investi » — une hausse non déclarée est traitée comme un gain."}
            </p>
          )}
        </>
      )}
    </>
  )
}
