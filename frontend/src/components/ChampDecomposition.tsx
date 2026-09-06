import type { ModeDecomposition } from '../utils/valorisationDecomposition'
import { formatEuro } from '../utils/format'
import { SegmentedControl } from './Controls'

/** Bascule versement/plus-value (retour utilisateur 30/08/2026, suite § U.2) :
 * selon ce que l'utilisateur connaît réellement (un versement précis relevé sur son
 * compte, ou directement la plus-value affichée par son contrat), il choisit lequel
 * saisir — l'autre est toujours déduit, jamais demandé deux fois. La bascule
 * « Plus-value » est désactivée sans point antérieur connu (rien dont déduire une
 * plus-value) ; le versement reste alors la seule saisie possible, comme avant
 * cette fonctionnalité. */
export default function ChampDecomposition({
  mode,
  onModeChange,
  montant,
  onMontantChange,
  valeur,
  valeurPrecedente,
  montantsMasques,
  libelleVersement,
  libellePlusValue,
  ariaLabelVersement,
  ariaLabelPlusValue,
}: {
  mode: ModeDecomposition
  onModeChange: (m: ModeDecomposition) => void
  montant: string
  onMontantChange: (v: string) => void
  valeur: string
  valeurPrecedente: number | null
  montantsMasques: boolean
  libelleVersement: string
  libellePlusValue: string
  ariaLabelVersement?: string
  ariaLabelPlusValue?: string
}) {
  const delta = valeurPrecedente !== null && valeur ? Number(valeur) - valeurPrecedente : null
  const autre = delta !== null && montant ? delta - Number(montant) : null

  return (
    <div className="flex flex-col gap-1 text-xs font-medium text-texte-attenue">
      {/* Bascule hors du `<label>` ci-dessous : son texte doit rester exactement le
          libellé du champ (nom accessible de l'input), pas concaténé à "Versement
          Plus-value". */}
      <span className="w-fit normal-case">
        <SegmentedControl
          options={[
            { valeur: 'versement', libelle: 'Versement' },
            {
              valeur: 'plus_value',
              libelle: 'Plus-value',
              aide: valeurPrecedente === null ? 'Nécessite un point antérieur connu' : undefined,
              desactive: valeurPrecedente === null,
            },
          ]}
          valeur={mode}
          onChange={(v) => {
            onModeChange(v)
            onMontantChange('')
          }}
          taille="sm"
          ariaLabel="Nature du montant saisi"
        />
      </span>
      <label className="flex flex-col gap-1">
        {mode === 'versement' ? libelleVersement : libellePlusValue}
        <input
          value={montant}
          onChange={(e) => onMontantChange(e.target.value)}
          type="number"
          step="any"
          placeholder="optionnel"
          aria-label={mode === 'versement' ? ariaLabelVersement : ariaLabelPlusValue}
          className="w-32 rounded-md border border-bordure bg-surface px-2 py-1.5 text-sm text-texte"
        />
      </label>
      {autre !== null && (
        <span className="font-normal">
          → {mode === 'versement' ? 'plus-value déduite' : 'versement déduit'} : {formatEuro(autre, 2, montantsMasques)}
        </span>
      )}
    </div>
  )
}
