import type { AllocationBreakdownItem } from '../api/types'

/** Barres horizontales de répartition (écran Analyse) — la forme exacte de la
 * maquette : une grille CSS de trois colonnes, `libellé | piste | valeur`, en
 * lignes de 40 px.
 *
 * Ce n'est plus du Recharts, et c'est délibéré. Deux raisons :
 *
 * 1. **La mise en page.** Recharts répartit ses barres sur toute la hauteur du
 *    conteneur : deux catégories dans un panneau de 200 px donnent deux barres
 *    séparées par 76 px de vide, là où la maquette empile des lignes de 40 px. La
 *    hauteur d'un graphique Recharts se calcule ; celle d'une liste se déduit de son
 *    contenu.
 * 2. **Le piège du libellé de valeur.** Une barre en pourcentage et sa valeur, frères
 *    dans une même ligne flex, résolvent leur pourcentage sur TOUTE la ligne : à
 *    100 %, la barre réclame la largeur entière et « 79 728 € » se casse en
 *    « 79 728 » puis « € ». La colonne de valeur dédiée, avec la piste en
 *    `minmax(0,1fr)`, ferme le problème par construction.
 *
 * Une barre de proportion est du HTML : un graphique de 400 Ko pour des `<span>` de
 * largeur proportionnelle est un coût sans contrepartie. */
export default function AllocationBarChart({
  items,
  onCategoryClick,
}: {
  items: AllocationBreakdownItem[]
  onCategoryClick?: (categorie: string) => void
}) {
  // Rapportées au plus grand et non à 100 : une répartition dont la plus grosse part
  // fait 30 % afficherait sinon cinq moignons dans un panneau vide. C'est la
  // COMPARAISON entre les parts qui se lit ici, le total est déjà connu.
  const maximum = Math.max(...items.map((i) => i.pourcentage_reel), 0)

  return (
    <div className="grid grid-cols-[minmax(0,150px)_minmax(0,1fr)_auto] gap-x-4">
      {items.map((item) => {
        const contenu = (
          <>
            <span title={item.categorie} className="flex h-10 items-center truncate text-[13px] text-ink2">
              {item.categorie}
            </span>
            <span className="flex h-10 min-w-0 items-center">
              <span
                className="h-6 rounded-r-[12px] bg-s1"
                style={{ width: maximum > 0 ? `${(item.pourcentage_reel / maximum) * 100}%` : 0 }}
              />
            </span>
            <span className="flex h-10 items-center whitespace-nowrap text-[13px] font-semibold text-ink">
              {item.pourcentage_reel.toFixed(1)} %
            </span>
          </>
        )
        return onCategoryClick ? (
          <button
            key={item.categorie}
            type="button"
            onClick={() => onCategoryClick(item.categorie)}
            title={`Voir le détail des lignes de « ${item.categorie} »`}
            className="col-span-3 grid grid-cols-subgrid rounded-control text-left transition-colors hover:bg-hover"
          >
            {contenu}
          </button>
        ) : (
          <div key={item.categorie} className="col-span-3 grid grid-cols-subgrid">
            {contenu}
          </div>
        )
      })}
    </div>
  )
}
