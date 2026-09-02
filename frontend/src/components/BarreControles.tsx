import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { Detenteur } from '../api/types'
import { usePreferencesAffichage } from '../hooks/usePreferencesAffichage'
import type { Lentille } from '../contexts/preferencesAffichageContextObject'
import { dateVersISO } from '../utils/format'
import { PERIODES_RELATIVES, type PeriodeRelative } from '../utils/periode'
import { IconOeil, IconOeilBarre } from './icons'

// `aide` : infobulle par option plutôt qu'une seule sur le groupe — c'est la
// DIFFÉRENCE entre les trois qui est obscure pour un nouvel utilisateur, pas la
// notion de « vue » (recette du 02/09/2026).
const OPTIONS_LENTILLE: { valeur: Lentille; label: string; aide: string }[] = [
  {
    valeur: 'net',
    label: 'Net',
    aide: 'Patrimoine net : tout ce que vous possédez, MOINS ce que vous devez (emprunts en cours). C\'est votre valeur nette réelle.',
  },
  {
    valeur: 'brut',
    label: 'Brut',
    aide: "Patrimoine brut : tout ce que vous possédez, SANS déduire les emprunts. Un bien à crédit y compte pour sa valeur entière.",
  },
  {
    valeur: 'financier',
    label: 'Financier',
    aide: 'Portefeuille financier seul : actions, ETF, crypto, obligations. Exclut immobilier, épargne et véhicules.',
  },
]

const AIDE_DETENTEUR =
  "Filtre tout l'écran sur la part d'une seule personne/société du foyer, selon les répartitions (quotités) que vous avez saisies. « Foyer » = tout le patrimoine, sans filtre."

const AIDE_MONTANTS_MASQUES =
  'Remplace tous les montants par des points — pratique pour une démonstration, une capture d\'écran ou une consultation en public. Les pourcentages restent visibles.'

const VALEUR_PERSONNALISEE = 'personnalisee'

/** Barre de contrôles transverses (backlog 2.K.3/2.L.1), persistante et visible sur
 * tous les écrans (montée une seule fois dans `App.tsx`, en tête de `<main>`) —
 * lentille patrimoine net/brut/financier, filtre Détenteur (foyer ou une personne/
 * société précise), Période (graphique d'évolution + Rapport uniquement, cf.
 * `title` ci-dessous) et bascule "masquer les montants". */
export default function BarreControles() {
  const { lentille, setLentille, montantsMasques, toggleMontantsMasques, detenteurId, setDetenteurId, periode, setPeriode } =
    usePreferencesAffichage()
  const [detenteurs, setDetenteurs] = useState<Detenteur[]>([])

  useEffect(() => {
    api.listDetenteurs().then(setDetenteurs).catch(() => setDetenteurs([]))
  }, [])

  return (
    <div className="sticky top-0 z-10 flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-bordure bg-surface px-3 py-2.5 md:px-6">
      <span className="text-xs font-medium uppercase tracking-wide text-texte-attenue">Vue</span>
      <div className="flex gap-0.5 rounded-md bg-surface-elevee p-0.5">
        {OPTIONS_LENTILLE.map((option) => (
          <button
            key={option.valeur}
            type="button"
            onClick={() => setLentille(option.valeur)}
            aria-pressed={lentille === option.valeur}
            title={option.aide}
            className={`rounded px-2.5 py-1 text-sm font-medium transition-colors ${
              lentille === option.valeur ? 'bg-texte text-surface' : 'text-texte-attenue hover:text-texte'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {detenteurs.length > 0 && (
        <>
          <span className="text-xs font-medium uppercase tracking-wide text-texte-attenue">Détenteur</span>
          <select
            value={detenteurId ?? ''}
            onChange={(e) => setDetenteurId(e.target.value === '' ? null : Number(e.target.value))}
            title={AIDE_DETENTEUR}
            className="rounded-md border border-bordure bg-surface px-2 py-1 text-sm text-texte"
          >
            <option value="">Foyer</option>
            {detenteurs.map((d) => (
              <option key={d.id} value={d.id}>
                {d.nom}
              </option>
            ))}
          </select>
        </>
      )}

      <span className="text-xs font-medium uppercase tracking-wide text-texte-attenue">Période</span>
      <select
        value={periode.type === 'personnalisee' ? VALEUR_PERSONNALISEE : periode.valeur}
        onChange={(e) => {
          const valeur = e.target.value
          if (valeur === VALEUR_PERSONNALISEE) {
            const aujourdhui = dateVersISO(new Date())
            setPeriode({ type: 'personnalisee', dateDebut: aujourdhui, dateFin: aujourdhui })
          } else {
            setPeriode({ type: 'relative', valeur: valeur as PeriodeRelative })
          }
        }}
        title="S'applique au Rapport et à l'évolution du patrimoine"
        className="rounded-md border border-bordure bg-surface px-2 py-1 text-sm text-texte"
      >
        {PERIODES_RELATIVES.map((p) => (
          <option key={p.valeur} value={p.valeur}>
            {p.label}
          </option>
        ))}
        <option value={VALEUR_PERSONNALISEE}>Personnalisée…</option>
      </select>
      {periode.type === 'personnalisee' && (
        <div className="flex items-center gap-1.5">
          <input
            type="date"
            value={periode.dateDebut}
            onChange={(e) => setPeriode({ type: 'personnalisee', dateDebut: e.target.value, dateFin: periode.dateFin })}
            className="rounded-md border border-bordure bg-surface px-2 py-1 text-sm text-texte"
          />
          <span className="text-xs text-texte-attenue">au</span>
          <input
            type="date"
            value={periode.dateFin}
            onChange={(e) => setPeriode({ type: 'personnalisee', dateDebut: periode.dateDebut, dateFin: e.target.value })}
            className="rounded-md border border-bordure bg-surface px-2 py-1 text-sm text-texte"
          />
        </div>
      )}

      <button
        type="button"
        onClick={toggleMontantsMasques}
        aria-pressed={montantsMasques}
        title={`${montantsMasques ? 'Afficher' : 'Masquer'} les montants (Ctrl/⌘ + Maj + M). ${AIDE_MONTANTS_MASQUES}`}
        className="ml-auto flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-texte-attenue hover:bg-surface-elevee"
      >
        {montantsMasques ? <IconOeilBarre className="h-4 w-4" /> : <IconOeil className="h-4 w-4" />}
        <span className="hidden sm:inline">{montantsMasques ? 'Montants masqués' : 'Masquer les montants'}</span>
      </button>
    </div>
  )
}
