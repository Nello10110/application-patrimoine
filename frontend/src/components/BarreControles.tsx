import { usePreferencesAffichage } from '../hooks/usePreferencesAffichage'
import type { Lentille } from '../contexts/preferencesAffichageContextObject'
import { IconOeil, IconOeilBarre } from './icons'

const OPTIONS_LENTILLE: { valeur: Lentille; label: string }[] = [
  { valeur: 'net', label: 'Net' },
  { valeur: 'brut', label: 'Brut' },
  { valeur: 'financier', label: 'Financier' },
]

/** Barre de contrôles transverses (backlog 2.K.3), persistante et visible sur tous
 * les écrans (montée une seule fois dans `App.tsx`, en tête de `<main>`) — lentille
 * patrimoine net/brut/financier et bascule "masquer les montants". Période et
 * Détenteur restent hors périmètre de cet incrément (cf. plan). */
export default function BarreControles() {
  const { lentille, setLentille, montantsMasques, toggleMontantsMasques } = usePreferencesAffichage()

  return (
    <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-bordure bg-surface px-6 py-2.5">
      <span className="text-xs font-medium uppercase tracking-wide text-texte-attenue">Vue</span>
      <div className="flex gap-0.5 rounded-md bg-surface-elevee p-0.5">
        {OPTIONS_LENTILLE.map((option) => (
          <button
            key={option.valeur}
            type="button"
            onClick={() => setLentille(option.valeur)}
            aria-pressed={lentille === option.valeur}
            className={`rounded px-2.5 py-1 text-sm font-medium transition-colors ${
              lentille === option.valeur ? 'bg-texte text-surface' : 'text-texte-attenue hover:text-texte'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={toggleMontantsMasques}
        aria-pressed={montantsMasques}
        title={`${montantsMasques ? 'Afficher' : 'Masquer'} les montants (Ctrl/⌘ + Maj + M)`}
        className="ml-auto flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-texte-attenue hover:bg-surface-elevee"
      >
        {montantsMasques ? <IconOeilBarre className="h-4 w-4" /> : <IconOeil className="h-4 w-4" />}
        <span className="hidden sm:inline">{montantsMasques ? 'Montants masqués' : 'Masquer les montants'}</span>
      </button>
    </div>
  )
}
