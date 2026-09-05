import type { Etablissement } from '../api/types'
import CatalogueEtablissementPicker from './CatalogueEtablissementPicker'

// Sentinelle pour l'option "+ Nouvel établissement..." — même patron que
// `NOUVEAU_COMPTE` dans `PositionsTable.tsx`/`AjoutHoldingForm.tsx`, distincte de
// toute valeur réelle possible (un id d'établissement est toujours numérique).
export const NOUVEAU_ETABLISSEMENT = '__nouveau__'

/** Sélecteur d'établissement partagé (revue du 03/09/2026, compte/établissement
 * obligatoires) — existant / + nouveau, avec un champ texte pour le nom du nouvel
 * établissement. `required` retire l'option "— Aucun —" (compte : établissement
 * obligatoire à la création) ; omis, elle reste disponible (emprunt : établissement
 * optionnel). Consommé par `AjoutCompteForm`, `AjoutHoldingForm`, `PositionsTable`,
 * `RattrapageComptes`, `ImportTransactionsSection`.
 *
 * `logoKeyNouveau`/`onLogoKeyNouveauChange` (refonte import, 05/09/2026, optionnels
 * — un appelant qui ne les fournit pas garde le comportement d'avant, établissement
 * personnalisé sans logo) : au-dessus du champ texte libre, une grille
 * `CatalogueEtablissementPicker` propose les établissements connus ; en choisir un
 * préremplit `nomNouveau` avec son nom canonique ET pose `logoKeyNouveau`. */
export default function SelecteurEtablissement({
  etablissements,
  value,
  nomNouveau,
  onValueChange,
  onNomNouveauChange,
  logoKeyNouveau = null,
  onLogoKeyNouveauChange,
  required = false,
  ariaLabel = 'Établissement',
  className,
}: {
  etablissements: Etablissement[]
  value: string
  nomNouveau: string
  onValueChange: (v: string) => void
  onNomNouveauChange: (v: string) => void
  logoKeyNouveau?: string | null
  onLogoKeyNouveauChange?: (v: string | null) => void
  required?: boolean
  ariaLabel?: string
  className?: string
}) {
  return (
    <>
      <select
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        onClick={(e) => e.stopPropagation()}
        aria-label={ariaLabel}
        className={className ?? 'w-full rounded-md border border-bordure bg-surface px-3 py-2 text-sm text-texte sm:w-40 sm:px-2 sm:py-1'}
      >
        {!required && <option value="">— Sans établissement —</option>}
        {required && value === '' && <option value="">— Choisir —</option>}
        {etablissements.map((et) => (
          <option key={et.id} value={et.id}>
            {et.nom}
          </option>
        ))}
        <option value={NOUVEAU_ETABLISSEMENT}>+ Nouvel établissement...</option>
      </select>
      {value === NOUVEAU_ETABLISSEMENT && (
        <div className="mt-1 flex flex-col gap-2">
          {onLogoKeyNouveauChange && (
            <CatalogueEtablissementPicker
              selection={logoKeyNouveau}
              onSelect={(cle, nom) => {
                onLogoKeyNouveauChange(cle)
                onNomNouveauChange(nom)
              }}
            />
          )}
          <input
            value={nomNouveau}
            onChange={(e) => {
              onNomNouveauChange(e.target.value)
              onLogoKeyNouveauChange?.(null)
            }}
            onClick={(e) => e.stopPropagation()}
            aria-label={`Nom du nouvel établissement (${ariaLabel})`}
            placeholder="Boursorama, Caisse d'Épargne..."
            className="w-full rounded-md border border-bordure bg-surface px-3 py-2 text-sm text-texte sm:w-40 sm:px-2 sm:py-1"
          />
        </div>
      )}
    </>
  )
}
