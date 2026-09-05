import { CATALOGUE_ETABLISSEMENTS } from '../utils/etablissementsConnus'
import EtablissementLogo from './EtablissementLogo'

/** Grille de sélection d'un établissement connu (refonte import, 05/09/2026) —
 * choisir une entrée préremplit le nom (et le logo) ; « Personnalisé » retombe sur
 * la saisie libre déjà existante (`SelecteurEtablissement`/`EtablissementsCard`).
 * `selection` : clé actuellement choisie (`null` = personnalisé), pour surligner
 * l'entrée active. */
export default function CatalogueEtablissementPicker({
  selection,
  onSelect,
}: {
  selection: string | null
  onSelect: (cle: string | null, nom: string) => void
}) {
  return (
    <fieldset className="flex flex-wrap gap-2 border-0 p-0 m-0">
      <legend className="sr-only">Établissement connu</legend>
      {CATALOGUE_ETABLISSEMENTS.map((e) => (
        <button
          key={e.cle}
          type="button"
          onClick={() => onSelect(e.cle, e.nom)}
          className={`flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs text-texte transition-colors ${
            selection === e.cle ? 'border-accent bg-accent/10' : 'border-bordure bg-surface hover:border-accent/50'
          }`}
        >
          <EtablissementLogo logoKey={e.cle} nom={e.nom} taille="sm" />
          {e.nom}
        </button>
      ))}
      <button
        type="button"
        onClick={() => onSelect(null, '')}
        className={`rounded-full border px-2 py-1 text-xs text-texte-attenue transition-colors ${
          selection === null ? 'border-accent bg-accent/10' : 'border-bordure bg-surface hover:border-accent/50'
        }`}
      >
        Personnalisé...
      </button>
    </fieldset>
  )
}
