import type { ReactNode } from 'react'
import { ResponsiveContainer } from 'recharts'
import { HAUTEUR } from '../utils/chartTheme'

/** Cadre d'une COURBE (aire ou ligne dans le temps) — impose le langage graphique de
 * la maquette : aucune grille, aucun axe dessiné, et cinq repères de date en HTML
 * sous le tracé.
 *
 * Extrait de `PortfolioHistoryChart`, qui était le seul graphique à le faire
 * correctement. En faire un composant partagé est le seul moyen que les neuf autres
 * s'y conforment sans que chacun re-décide.
 *
 * Les repères sont en HTML et non un `XAxis` : ils s'alignent sur la grille
 * typographique du panneau (11 px, `--ink4`), et un axe Recharts réserve une bande
 * de 30 px de haut qui écrase le tracé dans un panneau de 180 px.
 *
 * Usage :
 *
 *     <ChartFrame reperes={reperesAxe} hauteur="panneau">
 *       <AreaChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
 *         <defs><DegradeAire id="aireValorisation" /></defs>
 *         <XAxis dataKey="date" hide />
 *         <YAxis hide domain={['dataMin', 'dataMax']} />
 *         <Tooltip {...STYLE_INFOBULLE} />
 *         <Area dataKey="Valeur" stroke="var(--accent)" strokeWidth={TRAIT_PRINCIPAL}
 *               fill="url(#aireValorisation)" dot={false} isAnimationActive={false} />
 *       </AreaChart>
 *     </ChartFrame>
 */
export function ChartFrame({
  children,
  reperes,
  hauteur = 'panneau',
  bas,
}: {
  /** Le graphique Recharts. Ses deux axes doivent porter `hide`. */
  children: ReactNode
  /** Cinq libellés déjà formatés — voir `reperesTemporels()`. Liste vide = aucun. */
  reperes?: string[]
  hauteur?: keyof typeof HAUTEUR | number
  /** Contenu sous les repères (note, légende, sélecteur de période mobile). */
  bas?: ReactNode
}) {
  const h = typeof hauteur === 'number' ? hauteur : HAUTEUR[hauteur]
  return (
    <>
      <ResponsiveContainer width="100%" height={h}>
        {children}
      </ResponsiveContainer>
      {reperes && reperes.length > 0 ? (
        <div className="flex justify-between pt-0.5 text-[11px] text-ink4">
          {reperes.map((libelle, i) => (
            <span key={`${libelle}-${i}`}>{libelle}</span>
          ))}
        </div>
      ) : null}
      {bas}
    </>
  )
}

/** Cinq repères de date répartis sur une série — la même règle partout, plutôt que
 * chaque graphique qui décide de son échantillonnage.
 *
 * `formater` reçoit la valeur brute de `cle` (une date ISO en général) et rend le
 * libellé affiché : passer `formatDate` de `utils/format`. */
export function reperesTemporels<T extends Record<string, unknown>>(
  data: T[],
  cle: keyof T,
  formater: (valeur: string) => string,
): string[] {
  if (data.length === 0) return []
  const pas = (data.length - 1) / 4
  return Array.from({ length: 5 }, (_, i) => {
    const point = data[Math.round(i * pas)]
    return point ? formater(String(point[cle])) : ''
  })
}

/** Répartition en barre empilée + liste — le motif de la maquette, et le
 * REMPLACEMENT des camemberts restants (`PieChartCard`, la part camembert de
 * `CompositionModal`, `AllocationPieChart` devenu mort).
 *
 * La première décision structurelle de la refonte était : « un seul langage
 * graphique, plus de camembert doublé d'une liste qui répète les mêmes chiffres ».
 * `AllocationChartCard` l'a bien appliquée en retirant sa bascule barres/camembert ;
 * trois composants y ont échappé. Ce composant leur donne la forme retenue —
 * elle reste lisible au-delà de cinq parts, là où un camembert devient un anneau de
 * miettes, et elle ne demande pas d'étiquette posée sur une part de 3 %.
 *
 * Aucun Recharts ici : une barre empilée et une liste sont du HTML. Un graphique de
 * 400 Ko pour cinq `<span>` de largeur proportionnelle est un coût sans contrepartie. */
export function RepartitionEmpilee({
  parts,
  onPartClick,
}: {
  /** Déjà triées, du plus grand au plus petit. `valeur` est le MONTANT formaté,
   * affiché à droite du libellé ; le pourcentage suit dans sa propre colonne.
   *
   * `valeur` est optionnel parce que certaines répartitions n'ont qu'un poids en
   * base (composition d'un fonds, répartition géographique d'un ETF) : l'afficher
   * alors dans les deux colonnes reproduirait exactement ce que la refonte combat —
   * une liste qui répète le même chiffre deux fois. Absente, la ligne ne porte que
   * son pourcentage. */
  parts: { nom: string; pourcentage: number; valeur?: string }[]
  onPartClick?: (nom: string) => void
}) {
  const classes = ['bg-s1', 'bg-s2', 'bg-s3', 'bg-s4', 'bg-s5']
  const classe = (i: number) => classes[Math.min(i, classes.length - 1)]

  return (
    <>
      <div className="flex h-3 gap-0.5 overflow-hidden rounded-chip">
        {parts.map((p, i) => (
          <span
            key={p.nom}
            className={classe(i)}
            style={{ width: `${p.pourcentage}%` }}
            title={`${p.nom} — ${p.valeur}`}
          />
        ))}
      </div>
      <div className="mt-4 flex flex-col">
        {parts.map((p, i) => {
          const contenu = (
            <>
              <span aria-hidden className={`h-2 w-2 shrink-0 rounded-[3px] ${classe(i)}`} />
              <span className="truncate text-[13px] text-ink2">{p.nom}</span>
              {p.valeur ? (
                <>
                  <span className="ml-auto shrink-0 text-[13px] text-ink3">{p.valeur}</span>
                  <span className="w-16 shrink-0 text-right text-[15px] font-semibold text-ink">
                    {p.pourcentage.toFixed(1)} %
                  </span>
                </>
              ) : (
                <span className="ml-auto shrink-0 text-[15px] font-semibold text-ink">{p.pourcentage.toFixed(1)} %</span>
              )}
            </>
          )
          const base = 'flex w-full items-center gap-2.5 border-b border-hairline py-2 text-left last:border-b-0'
          return onPartClick ? (
            <button key={p.nom} type="button" onClick={() => onPartClick(p.nom)} className={`${base} hover:bg-hover`}>
              {contenu}
            </button>
          ) : (
            <div key={p.nom} className={base}>
              {contenu}
            </div>
          )
        })}
      </div>
    </>
  )
}
