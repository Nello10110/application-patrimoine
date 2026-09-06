import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import type { PatrimoineHistoryPoint, PatrimoineNet, PortfolioHistoryPoint } from '../api/types'
import { usePreferencesAffichage } from '../hooks/usePreferencesAffichage'
import { formatEuro } from '../utils/format'
import { bornesPeriode, libellePeriodeEcoulee, variationSurPeriode } from '../utils/periode'
import Card from './Card'
import { DeltaBadge } from './Controls'
import EtatErreur from './EtatErreur'
import { GlassPanel } from './GlassPanel'
import { SkeletonTexte } from './Skeleton'

// Une seule famille, du plus au moins important (`--s1`…`--s5`) — les catégories
// au-delà de la cinquième partagent la teinte la plus claire : au-delà, la
// distinction de couleur n'informe plus, seul le libellé le fait.
const COULEURS_SERIE = ['bg-s1', 'bg-s2', 'bg-s3', 'bg-s4', 'bg-s5']

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

/** Une des trois poches sous le chiffre héros : un panneau de verre cliquable qui
 * mène à l'écran où cette part se détaille. Survol : `--panel` → `--panel-hi`, sans
 * aucune transformation (le verre ne bouge pas, cf. paquet de design). */
function Poche({
  libelle,
  valeur,
  note,
  vers,
  montantsMasques,
  ton = 'neutre',
}: {
  libelle: string
  valeur: number
  note: string
  vers: string
  montantsMasques: boolean
  ton?: 'neutre' | 'negatif'
}) {
  return (
    <Link
      to={vers}
      className="rounded-card border border-stroke bg-panel px-[18px] py-4 transition-colors hover:bg-panel-hi"
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-ink3">{libelle}</p>
      <p className={`mt-1 text-[26px] font-semibold ${ton === 'negatif' ? 'text-neg' : 'text-ink'}`}>
        {formatEuro(valeur, 0, montantsMasques)}
      </p>
      <p className="mt-0.5 text-[13px] text-ink4">{note}</p>
    </Link>
  )
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
  // lentille "financier", filtre aux seules catégories financières ; en "net", nette
  // chaque ligne de SON emprunt rattaché plutôt que la valeur brute (retour
  // utilisateur : l'actif net d'un bien, c'est sa valeur moins ce qu'il reste à
  // rembourser dessus) — "brut" reste tous-actifs en valeur brute, inchangé.
  const repartitionAffichee =
    lentille === 'financier'
      ? patrimoine.repartition_par_classe_financiere
      : lentille === 'net'
        ? patrimoine.repartition_par_classe_nette
        : patrimoine.repartition_par_classe
  // Les pourcentages de la barre empilée se calculent sur la somme des parts
  // POSITIVES, pas sur le total du patrimoine : une part négative (équité négative
  // d'un bien, dettes non rattachées) n'occupe aucune largeur, et rapporter les
  // largeurs à un total qui l'inclut ferait une barre qui ne remplit jamais 100 %.
  const partsPositives = repartitionAffichee.filter((item) => item.valeur > 0)
  const totalPositif = partsPositives.reduce((somme, item) => somme + item.valeur, 0)

  return (
    <GlassPanel niveau="hero" className="px-6 pb-5 pt-6">
      {/* UN SEUL chiffre héros par écran (première des trois décisions structurelles
          de la refonte) : l'ancienne carte annonçait « Patrimoine net » trois fois —
          titre de carte, libellé, valeur — et empilait quatre tuiles de même poids.
          Il ne reste que le sur-titre, le chiffre à 54 px et sa variation. */}
      <p className="text-[13px] font-medium text-ink3">
        {principale.label} · {detenteurId === null ? 'Foyer' : 'Détenteur sélectionné'}
      </p>
      <p className={`text-heros ${toneClassPrincipale}`}>
        {formatEuro(principale.valeur, 0, montantsMasques)}
      </p>
      {variationPct !== null && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <DeltaBadge
            valeur={`${variationPct >= 0 ? '↑' : '↓'} ${Math.abs(variationPct).toFixed(1)} %`}
            positif={variationPct >= 0}
          />
          <span className="text-[13px] text-ink3">
            {libellePeriodeEcoulee(periode)} — {LEGENDE_VARIATION[lentille]}
          </span>
        </div>
      )}

      {/* Trois « poches » cliquables sous le chiffre héros (maquette de la refonte).
          Écart assumé sur leur découpage : la maquette proposait financier /
          immobilier net / épargne, trois postes que `PatrimoineNet` ne sait pas
          isoler sans deviner à partir des libellés de catégories. Ces trois-là se
          déduisent exactement des chiffres déjà calculés côté serveur — et couvrent
          la même information que les deux tuiles qu'elles remplacent (actifs, dont
          la ventilation, et passifs). */}
      <div className="mt-5 grid gap-[14px] sm:grid-cols-2 lg:grid-cols-3">
        <Poche
          libelle="Financier"
          valeur={patrimoine.patrimoine_financier}
          note="Actions, ETF, crypto, obligations"
          vers="/patrimoine"
          montantsMasques={montantsMasques}
        />
        <Poche
          libelle="Immobilier & épargne"
          valeur={patrimoine.actifs_totaux - patrimoine.patrimoine_financier}
          note="Biens, assurances-vie, livrets"
          vers="/comptes"
          montantsMasques={montantsMasques}
        />
        <Poche
          libelle="Emprunts"
          valeur={patrimoine.passifs_totaux}
          note="Capital restant dû"
          vers="/comptes"
          montantsMasques={montantsMasques}
          ton={patrimoine.passifs_totaux > 0 ? 'negatif' : 'neutre'}
        />
      </div>

      {repartitionAffichee.length > 0 && (
        <div className="mt-5 border-t border-hairline pt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink3">Par type d'investissement</p>

          {/* UN SEUL langage graphique (troisième décision structurelle) : le
              camembert à 7 couleurs doublé d'une liste qui répétait les mêmes
              chiffres laisse place à une barre empilée unique, dans une seule famille
              de bleus dégradée du plus au moins important. Plus jamais deux
              représentations du même jeu de données.
              Les parts NÉGATIVES (équité négative d'un bien, dettes non rattachées)
              n'ont pas de largeur dans une barre empilée : elles sortent de la barre
              mais restent listées en dessous, à leur valeur réelle — jamais escamotées. */}
          {totalPositif > 0 && (
            <div className="mt-3 flex h-3 gap-0.5 overflow-hidden rounded-chip">
              {partsPositives.map((item, i) => (
                <div
                  key={item.categorie}
                  className={COULEURS_SERIE[Math.min(i, COULEURS_SERIE.length - 1)]}
                  style={{ width: `${(item.valeur / totalPositif) * 100}%` }}
                  title={`${item.categorie} : ${formatEuro(item.valeur, 0, montantsMasques)}`}
                />
              ))}
            </div>
          )}

          <div className="mt-3 grid gap-x-4 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
            {repartitionAffichee.map((item, i) => {
              const rang = partsPositives.findIndex((p) => p.categorie === item.categorie)
              return (
                <div key={item.categorie} className="flex items-center gap-2">
                  <span
                    aria-hidden
                    className={`h-2 w-2 shrink-0 rounded-[3px] ${
                      rang >= 0 ? COULEURS_SERIE[Math.min(rang, COULEURS_SERIE.length - 1)] : 'bg-ink4'
                    }`}
                  />
                  <span className="min-w-0 flex-1 truncate text-xs text-ink3">{item.categorie}</span>
                  <span className={`text-[15px] font-semibold ${item.valeur < 0 ? 'text-neg' : 'text-ink'}`}>
                    {formatEuro(item.valeur, 0, montantsMasques)}
                  </span>
                  {totalPositif > 0 && item.valeur > 0 && (
                    <span className="w-10 text-right text-xs text-ink4">
                      {((item.valeur / totalPositif) * 100).toFixed(0)} %
                    </span>
                  )}
                  {/* `i` conservé pour la stabilité de clé si deux catégories homonymes apparaissaient. */}
                  <span className="hidden">{i}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </GlassPanel>
  )
}
