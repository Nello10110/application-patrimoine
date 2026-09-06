import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { Detenteur } from '../api/types'
import { usePreferencesAffichage } from '../hooks/usePreferencesAffichage'
import type { Lentille } from '../contexts/preferencesAffichageContextObject'
import { useLocation } from 'react-router-dom'
import { GlassPanel } from './GlassPanel'
import { Pill, SegmentedControl } from './Controls'
import { IconEcran, IconLune, IconOeil, IconOeilBarre, IconSoleil } from './icons'
import { useTheme, type Theme } from '../hooks/useTheme'
import { ROUTES } from '../layout/routes'

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

// Icônes seules : trois positions doivent tenir dans une barre qui reste sur une
// seule ligne. Le libellé complet reste accessible par l'infobulle et le nom ARIA.
const OPTIONS_THEME: { valeur: Theme; libelle: React.ReactNode; aide: string }[] = [
  { valeur: 'clair', libelle: <IconSoleil className="h-4 w-4" />, aide: 'Thème clair' },
  { valeur: 'sombre', libelle: <IconLune className="h-4 w-4" />, aide: 'Thème sombre' },
  { valeur: 'systeme', libelle: <IconEcran className="h-4 w-4" />, aide: 'Suivre le système' },
]

/** Barre de contrôles transverses (backlog 2.K.3/2.L.1), persistante et visible sur
 * tous les écrans (montée une seule fois dans `App.tsx`, en tête de `<main>`) —
 * lentille patrimoine net/brut/financier, filtre Détenteur (foyer ou une personne/
 * société précise), bascule "masquer les montants" et thème.
 *
 * La Période N'EST PLUS ici (refonte « liquid glass », étape 4) : elle vit désormais
 * à côté de la courbe qu'elle change (`PortfolioHistoryChart`), et le Rapport a ses
 * propres contrôles de période. Un sélecteur global qui pilotait certains écrans et
 * pas d'autres était exactement l'incohérence que la refonte devait supprimer.
 *
 * DESKTOP UNIQUEMENT depuis l'étape 6 : sous 768 px, `EnTeteMobile` la remplace (les
 * sept commandes de cette barre y défilaient horizontalement dans une bande de 40 px,
 * hors d'atteinte du pouce). Même partage que `Sidebar`/`BottomNav`. */
export default function BarreControles() {
  const { lentille, setLentille, montantsMasques, toggleMontantsMasques, detenteurId, setDetenteurId } =
    usePreferencesAffichage()
  const { theme, setTheme } = useTheme()
  const { pathname } = useLocation()
  const titreEcran = ROUTES.find((r) => r.path === pathname)?.titre ?? null
  const [detenteurs, setDetenteurs] = useState<Detenteur[]>([])

  useEffect(() => {
    api.listDetenteurs().then(setDetenteurs).catch(() => setDetenteurs([]))
  }, [])

  return (
    <GlassPanel className="hidden shrink-0 items-center gap-3 overflow-x-auto px-4 py-2.5 md:flex">
      <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-ink3">Vue</span>
      <SegmentedControl
        options={OPTIONS_LENTILLE.map((o) => ({ valeur: o.valeur, libelle: o.label, aide: o.aide }))}
        valeur={lentille}
        onChange={setLentille}
        ariaLabel="Vue"
      />

      {detenteurs.length > 0 && (
        <>
          <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-ink3">Détenteur</span>
          <select
            value={detenteurId ?? ''}
            onChange={(e) => setDetenteurId(e.target.value === '' ? null : Number(e.target.value))}
            title={AIDE_DETENTEUR}
            className="shrink-0 rounded-control border border-hairline bg-chip px-2 py-1 text-[13px] text-ink2"
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

      {/* Pilule de contexte : rappelle l'écran courant, à la place du fil d'Ariane
          retiré à cette étape. Lue depuis `ROUTES`, source unique du libellé. */}
      {titreEcran && (
        <span className="ml-auto shrink-0">
          <Pill>{titreEcran}</Pill>
        </span>
      )}

      <button
        type="button"
        onClick={toggleMontantsMasques}
        aria-pressed={montantsMasques}
        // Libellé visible court (« Visibles » / « Masqués ») pour tenir sur une
        // ligne, mais nom accessible complet : seul, « Visibles » ne dit pas de
        // quoi il parle à un lecteur d'écran.
        aria-label={`${montantsMasques ? 'Afficher' : 'Masquer'} les montants`}
        title={`${montantsMasques ? 'Afficher' : 'Masquer'} les montants (Ctrl/⌘ + Maj + M). ${AIDE_MONTANTS_MASQUES}`}
        className={`flex min-h-11 shrink-0 items-center gap-1.5 rounded-control px-2.5 text-[13px] transition-colors hover:bg-hover md:min-h-0 md:py-1.5 ${
          titreEcran ? '' : 'ml-auto'
        } text-ink2`}
      >
        {montantsMasques ? <IconOeilBarre className="h-4 w-4" /> : <IconOeil className="h-4 w-4" />}
        {/* Libellés courts (README étape 3) : la barre doit tenir sur une ligne jusqu'à 1000 px. */}
        <span className="hidden sm:inline">{montantsMasques ? 'Masqués' : 'Visibles'}</span>
      </button>

      {/* Thème à droite de la barre (README étape 3). Trois positions et non deux :
          l'application garde son mode « système », que la maquette ne prévoyait pas —
          cf. `hooks/useTheme.ts`. Icônes seules pour tenir sur une ligne. */}
      <SegmentedControl
        options={OPTIONS_THEME}
        valeur={theme}
        onChange={setTheme}
        taille="sm"
        ariaLabel="Thème"
        className="shrink-0"
      />
    </GlassPanel>
  )
}
