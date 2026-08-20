import { useEffect, useMemo, useState } from 'react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { api } from '../api/client'
import Card from '../components/Card'
import StatTile from '../components/StatTile'
import { COULEUR_AXE, COULEUR_GRILLE, STYLE_INFOBULLE, STYLE_TICK_AXE } from '../utils/chartTheme'
import { formatEuro } from '../utils/format'
import { agregerParAnnee, arrondi, calculerFire, calculerTrajectoire, calculerTrajectoireMensuelle, type PointAnnuel, type PointMensuel } from '../utils/interetsComposes'

const DUREES = [5, 10, 20, 30] as const
type Vue = 'annuelle' | 'mensuelle'

/** Année calendaire projetée, `offset` années après aujourd'hui (0 = cette année). */
function libelleAnnee(offset: number): string {
  return String(new Date().getFullYear() + offset)
}

/** Mois calendaire projeté, `offset` mois après aujourd'hui — calé sur le 1er du
 * mois pour éviter les débordements de `Date` en fin de mois (le 31 janvier + 1
 * mois ne doit jamais silencieusement retomber en mars). Ordre « année mois »
 * (ex. « 2027 Mars ») plutôt que l'ordre habituel du français (« mars 2027 ») :
 * cohérent avec le tri chronologique des lignes du tableau, l'année ressort en
 * premier au lieu d'être reléguée en fin de libellé. */
function libelleMoisAnnee(offset: number): string {
  const maintenant = new Date()
  const totalMois = maintenant.getMonth() + offset
  const annee = maintenant.getFullYear() + Math.floor(totalMois / 12)
  const mois = ((totalMois % 12) + 12) % 12
  const nomMois = new Date(annee, mois, 1).toLocaleDateString('fr-FR', { month: 'long' })
  return `${annee} ${nomMois.charAt(0).toUpperCase()}${nomMois.slice(1)}`
}

/** Simulateur de patrimoine, indépendance financière (FIRE) et calculateur
 * d'intérêts composés générique — une seule page plutôt que deux (Simulateur et
 * Outils, fusionnées) : les deux ne différaient que par la source du capital de
 * départ (patrimoine net réel vs saisi librement), pas par le calcul lui-même.
 * Le capital de départ est préempli avec le patrimoine net actuel (`GET
 * /api/patrimoine/net`, seul appel réseau de la page) mais reste modifiable, pour
 * couvrir aussi bien « où en sera mon patrimoine réel » que « et si je plaçais
 * 10 000€ à 6% ». Tout le reste (projection, tableau de détail, FIRE) est calculé
 * côté client (`utils/interetsComposes.ts`), avec mise à jour instantanée. */
export default function SimulateurPage() {
  const [capital, setCapital] = useState('')
  const [patrimoineNetActuel, setPatrimoineNetActuel] = useState<number | null>(null)
  const [chargementPatrimoine, setChargementPatrimoine] = useState(true)

  const [taux, setTaux] = useState('5')
  const [versement, setVersement] = useState('0')
  const [interetsDejaObtenus, setInteretsDejaObtenus] = useState('')
  const [duree, setDuree] = useState<number>(20)
  const [vue, setVue] = useState<Vue>('annuelle')

  const [depenseCible, setDepenseCible] = useState('')
  const [tauxRetrait, setTauxRetrait] = useState('4')

  useEffect(() => {
    api
      .getPatrimoineNet()
      .then((p) => {
        setPatrimoineNetActuel(p.patrimoine_net)
        setCapital(String(p.patrimoine_net))
      })
      .catch(() => {
        // Dégradé plutôt que bloquant : le calculateur reste utilisable en saisissant
        // un capital de départ à la main si le patrimoine net échoue à charger.
      })
      .finally(() => setChargementPatrimoine(false))

    // Préremplit « Intérêts déjà obtenus » avec le gain/perte déjà réalisé sur le
    // portefeuille financier (`GET /api/performance`, déjà utilisé par la carte
    // Rentabilité du Tableau de bord) — reste un champ facultatif et modifiable,
    // une moins-value éventuelle (négative) n'a pas de sens ici et devient 0.
    api
      .getPerformance()
      .then((perf) => setInteretsDejaObtenus(String(Math.max(0, perf.gain_perte_total))))
      .catch(() => {
        // Dégradé : le champ reste vide (0 par défaut au calcul) si la rentabilité
        // échoue à charger — jamais bloquant pour le reste du calculateur.
      })
  }, [])

  const capitalNum = Number(capital)
  const tauxNum = Number(taux)
  const versementNum = Number(versement)
  const valide =
    capital !== '' &&
    taux !== '' &&
    versement !== '' &&
    !Number.isNaN(capitalNum) &&
    !Number.isNaN(tauxNum) &&
    !Number.isNaN(versementNum) &&
    capitalNum >= 0 &&
    versementNum >= 0

  // Facultatif : `''` (jamais saisi/effacé) équivaut à 0, une valeur non numérique
  // saisie par erreur aussi — ce champ ne doit jamais bloquer le reste du
  // calculateur comme le font `capital`/`taux`/`versement` (cf. `valide`).
  const interetsDejaObtenusNum = interetsDejaObtenus === '' ? 0 : Number(interetsDejaObtenus) || 0

  const points = useMemo(
    () => (valide ? calculerTrajectoire(capitalNum, tauxNum, versementNum, duree, interetsDejaObtenusNum) : []),
    [valide, capitalNum, tauxNum, versementNum, duree, interetsDejaObtenusNum],
  )
  // Le tableau de détail (mensuel/annuel) part de la même trajectoire mensuelle que
  // le graphique — dérivée une seule fois ici, agrégée par année à la demande —
  // pour ne jamais afficher des chiffres qui pourraient diverger entre les deux vues.
  const pointsMensuels: PointMensuel[] = useMemo(
    () => (valide ? calculerTrajectoireMensuelle(capitalNum, tauxNum, versementNum, duree, interetsDejaObtenusNum) : []),
    [valide, capitalNum, tauxNum, versementNum, duree, interetsDejaObtenusNum],
  )
  const pointsAnnuels: PointAnnuel[] = useMemo(() => agregerParAnnee(pointsMensuels), [pointsMensuels])

  const dernierPoint = points[points.length - 1]
  const valeurFinale = dernierPoint?.valeur ?? 0
  const totalVerse = dernierPoint?.investi ?? 0
  const gains = arrondi(valeurFinale - totalVerse)

  const data = points.map((p) => ({ annee: p.annee, Investi: p.investi, Gains: arrondi(p.valeur - p.investi) }))

  const depenseCibleNum = Number(depenseCible)
  const tauxRetraitNum = Number(tauxRetrait)
  const fireValide = valide && depenseCible !== '' && depenseCibleNum > 0 && tauxRetrait !== '' && tauxRetraitNum > 0
  const fire = useMemo(
    () => (fireValide ? calculerFire(capitalNum, tauxNum, versementNum, depenseCibleNum, tauxRetraitNum) : null),
    [fireValide, capitalNum, tauxNum, versementNum, depenseCibleNum, tauxRetraitNum],
  )

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Simulateur</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Projette un capital dans le temps — une <strong>hypothèse</strong>, pas une promesse : les marchés ne progressent
          jamais de façon aussi régulière dans la réalité. Préempli avec ton patrimoine net actuel, mais librement modifiable
          pour tester n'importe quel autre scénario.
        </p>
      </div>

      <Card title="Hypothèses">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-500 dark:text-slate-400">
            Capital de départ (€)
            <input
              value={capital}
              onChange={(e) => setCapital(e.target.value)}
              type="number"
              step="any"
              min={0}
              disabled={chargementPatrimoine}
              className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
            />
            {patrimoineNetActuel !== null && capitalNum !== patrimoineNetActuel && (
              <button
                type="button"
                onClick={() => setCapital(String(patrimoineNetActuel))}
                className="text-left text-xs font-normal text-slate-400 underline hover:text-slate-600 dark:hover:text-slate-300"
              >
                Revenir au patrimoine net actuel ({formatEuro(patrimoineNetActuel, 0)})
              </button>
            )}
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-500 dark:text-slate-400">
            Intérêts déjà obtenus (€)
            <input
              value={interetsDejaObtenus}
              onChange={(e) => setInteretsDejaObtenus(e.target.value)}
              type="number"
              step="any"
              min={0}
              placeholder="optionnel"
              className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-500 dark:text-slate-400">
            Rendement annuel moyen (%)
            <input
              value={taux}
              onChange={(e) => setTaux(e.target.value)}
              type="number"
              step="any"
              className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-500 dark:text-slate-400">
            Versement mensuel (€)
            <input
              value={versement}
              onChange={(e) => setVersement(e.target.value)}
              type="number"
              step="any"
              min={0}
              className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
            />
          </label>
        </div>

        <div className="mt-4 flex flex-col gap-1 text-xs font-medium text-slate-500 dark:text-slate-400">
          Durée
          <div className="flex gap-1">
            {DUREES.map((d) => (
              <button
                key={d}
                onClick={() => setDuree(d)}
                className={`rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors ${
                  duree === d
                    ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600'
                }`}
              >
                {d} ans
              </button>
            ))}
          </div>
        </div>

        <p className="mt-3 text-xs text-slate-400 dark:text-slate-500">
          « Intérêts déjà obtenus » (optionnel) : la part du capital de départ déjà constituée de gains plutôt que de
          versements — pour un tableau de détail qui distingue les vrais intérêts déjà gagnés des futurs. Préempli avec le
          gain/perte de ton portefeuille financier, librement modifiable ou effaçable.
        </p>

        {chargementPatrimoine && <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">Chargement du patrimoine net...</p>}
        {!chargementPatrimoine && !valide && (
          <p className="mt-3 text-sm text-red-600 dark:text-red-400">Renseigne des valeurs numériques positives.</p>
        )}

        {!chargementPatrimoine && valide && (
          <>
            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <StatTile label="Valeur finale" value={formatEuro(valeurFinale, 0)} />
              <StatTile label="Total versé" value={formatEuro(totalVerse, 0)} />
              <StatTile label="Dont intérêts gagnés" value={formatEuro(gains, 0)} tone="good" />
            </div>

            <ResponsiveContainer width="100%" height={280} className="mt-4">
              <AreaChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke={COULEUR_GRILLE} />
                <XAxis
                  dataKey="annee"
                  tickFormatter={(v) => `+${v} an${v > 1 ? 's' : ''}`}
                  tick={{ fontSize: 11, ...STYLE_TICK_AXE }}
                  stroke={COULEUR_AXE}
                />
                <YAxis tickFormatter={(v) => formatEuro(Number(v), 0)} width={90} tick={{ fontSize: 11, ...STYLE_TICK_AXE }} stroke={COULEUR_AXE} />
                <Tooltip
                  formatter={(value) => formatEuro(Number(value), 0)}
                  labelFormatter={(v) => `Dans ${v} an${Number(v) > 1 ? 's' : ''}`}
                  {...STYLE_INFOBULLE}
                />
                <Area type="monotone" dataKey="Investi" stackId="1" stroke="#94a3b8" fill="#cbd5e1" />
                <Area type="monotone" dataKey="Gains" stackId="1" stroke="#16a34a" fill="#86efac" />
              </AreaChart>
            </ResponsiveContainer>

            <div className="mt-6 flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Détail par période</h3>
              <div className="flex gap-1">
                {(['annuelle', 'mensuelle'] as Vue[]).map((v) => (
                  <button
                    key={v}
                    onClick={() => setVue(v)}
                    className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                      vue === v
                        ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600'
                    }`}
                  >
                    {v === 'annuelle' ? 'Annuelle' : 'Mensuelle'}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-3 max-h-96 overflow-y-auto overflow-x-auto rounded-md border border-slate-200 dark:border-slate-700">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white dark:bg-slate-800">
                  <tr className="border-b border-slate-200 text-left text-xs font-medium uppercase text-slate-500 dark:border-slate-700 dark:text-slate-400">
                    <th scope="col" className="py-2 pl-3 pr-4">
                      Période
                    </th>
                    <th scope="col" className="py-2 pr-4 text-right">
                      Versements
                    </th>
                    <th scope="col" className="py-2 pr-4 text-right">
                      Intérêts
                    </th>
                    <th scope="col" className="py-2 pr-4 text-right">
                      Capital
                    </th>
                    <th scope="col" className="py-2 pr-4 text-right">
                      Versé cumulé
                    </th>
                    <th scope="col" className="py-2 pr-4 text-right">
                      Intérêts à date
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {vue === 'annuelle'
                    ? pointsAnnuels.map((p) => (
                        <tr key={p.annee}>
                          <td className="py-2 pl-3 pr-4 font-medium text-slate-900 dark:text-slate-100">
                            {p.annee === 0 ? 'Départ' : libelleAnnee(p.annee)}
                          </td>
                          <td className="py-2 pr-4 text-right tabular-nums">{formatEuro(p.versements)}</td>
                          <td className="py-2 pr-4 text-right tabular-nums text-emerald-600 dark:text-emerald-400">{formatEuro(p.interets)}</td>
                          <td className="py-2 pr-4 text-right tabular-nums font-medium text-slate-900 dark:text-slate-100">{formatEuro(p.capital)}</td>
                          <td className="py-2 pr-4 text-right tabular-nums">{formatEuro(p.verseCumule)}</td>
                          <td className="py-2 pr-4 text-right tabular-nums text-emerald-600 dark:text-emerald-400">{formatEuro(p.interetsCumules)}</td>
                        </tr>
                      ))
                    : pointsMensuels.map((p) => (
                        <tr key={p.moisIndex}>
                          <td className="py-2 pl-3 pr-4 font-medium text-slate-900 dark:text-slate-100">
                            {p.annee === 0 ? 'Départ' : libelleMoisAnnee(p.moisIndex)}
                          </td>
                          <td className="py-2 pr-4 text-right tabular-nums">{formatEuro(p.versement)}</td>
                          <td className="py-2 pr-4 text-right tabular-nums text-emerald-600 dark:text-emerald-400">{formatEuro(p.interets)}</td>
                          <td className="py-2 pr-4 text-right tabular-nums font-medium text-slate-900 dark:text-slate-100">{formatEuro(p.capital)}</td>
                          <td className="py-2 pr-4 text-right tabular-nums">{formatEuro(p.verseCumule)}</td>
                          <td className="py-2 pr-4 text-right tabular-nums text-emerald-600 dark:text-emerald-400">{formatEuro(p.interetsCumules)}</td>
                        </tr>
                      ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>

      <Card title="Indépendance financière (FIRE)">
        <p className="mb-4 text-xs text-slate-400 dark:text-slate-500">
          Le taux de retrait par défaut (4 %) est un choix méthodologique connu sous le nom de « règle des 4 % » — pas une
          vérité universelle, à ajuster selon ta propre prudence. Utilise le capital de départ, le rendement et le versement
          mensuel renseignés ci-dessus.
        </p>
        <div className="flex flex-wrap items-end gap-4">
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-500 dark:text-slate-400">
            Dépense annuelle cible (€)
            <input
              value={depenseCible}
              onChange={(e) => setDepenseCible(e.target.value)}
              type="number"
              step="any"
              placeholder="ex. 30000"
              className="w-36 rounded-md border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-500 dark:text-slate-400">
            Taux de retrait (%)
            <input
              value={tauxRetrait}
              onChange={(e) => setTauxRetrait(e.target.value)}
              type="number"
              step="any"
              className="w-28 rounded-md border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
            />
          </label>
        </div>

        {!depenseCible && <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">Renseigne une dépense annuelle cible pour voir le résultat.</p>}

        {fire && depenseCible && (
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <StatTile label="Patrimoine nécessaire" value={formatEuro(fire.patrimoineNecessaire, 0)} />
            <StatTile
              label="Indépendance financière"
              value={
                fire.anneesAvantIndependance === null
                  ? 'Non atteinte (60 ans)'
                  : fire.anneesAvantIndependance === 0
                    ? 'Déjà atteinte'
                    : `Dans ${fire.anneesAvantIndependance} ans`
              }
              tone={fire.anneesAvantIndependance === null ? 'warning' : 'good'}
            />
          </div>
        )}
      </Card>
    </div>
  )
}
