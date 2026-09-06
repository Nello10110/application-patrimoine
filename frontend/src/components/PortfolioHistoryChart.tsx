import { useEffect, useMemo, useState } from 'react'
import { Area, AreaChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { PatrimoineHistoryPoint, PortfolioHistoryPoint } from '../api/types'
import Card from './Card'
import { Pill, SegmentedControl } from './Controls'
import EtatErreur from './EtatErreur'
import EtatVide from './EtatVide'
import { SkeletonGraphique } from './Skeleton'
import { usePreferencesAffichage } from '../hooks/usePreferencesAffichage'
import { formatEuro } from '../utils/format'
import { PERIODES_RELATIVES, bornesPeriode } from '../utils/periode'
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

  return (
    <Card>
      {/* Refonte « liquid glass » (étape 4) : la période vit à CÔTÉ de la courbe
          qu'elle change, plus dans la barre du haut — c'était la deuxième des trois
          décisions structurelles du paquet de design. Elle reste la préférence
          transverse (`usePreferencesAffichage`) et non un état local : le chiffre
          héros juste au-dessus (`PatrimoineNetCard`) affiche la variation SUR CETTE
          MÊME PÉRIODE, et les deux doivent toujours raconter la même histoire. */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[15px] font-semibold -tracking-[0.01em] text-ink">Évolution du portefeuille</h2>
        <div className="flex flex-wrap items-center gap-2">
          <Pill
            actif={stackedEffectif}
            onClick={() => setStacked(!stackedEffectif)}
            title="Superpose l'investi sous le total : la tranche visible entre les deux courbes, ce sont les gains."
          >
            Mode étagé
          </Pill>
          <SegmentedControl
            options={PERIODES_RELATIVES.map((p) => ({ valeur: p.valeur, libelle: p.label }))}
            valeur={periode.type === 'relative' ? periode.valeur : 'TOUT'}
            onChange={(valeur) => setPeriode({ type: 'relative', valeur })}
            taille="sm"
            ariaLabel="Période du graphique"
          />
        </div>
      </div>

      {stackedEffectif && (
        <p className="mb-2 text-xs text-texte-attenue">
          {enFinancier ? (
            <>
              « Gains » inclut les ventes réalisées, dividendes et intérêts perçus — même chiffre que le Gain/Perte total
              de la carte Rentabilité globale.
            </>
          ) : (
            <>
              Pour l'immobilier/l'épargne, seul un versement explicitement déclaré (fiche du bien, champ « dont versement »)
              compte comme « Investi » — une hausse non déclarée est traitée comme un gain.
            </>
          )}
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
