import type { ReactNode } from 'react'

/* Champs de saisie — la primitive qui manquait au paquet v1, et la cause n°1 de la
 * non-uniformité constatée après portage.
 *
 * Environ 200 champs de l'application répètent à la main la même chaîne de classes :
 *
 *     rounded-control border border-bordure bg-surface px-2 py-1.5 text-sm text-texte
 *
 * Trois problèmes, tous visibles :
 *  1. `bg-surface` est OPAQUE — un rectangle blanc dans un panneau de verre ;
 *  2. `px-2 py-1.5 text-sm` donne un champ de 30 px de haut, là où la maquette en
 *     dessine un de 42 px en texte de 15 px : dans un formulaire, l'écart saute aux yeux ;
 *  3. chaque appelant peut dériver, et une bonne partie l'a fait.
 *
 * Un composant unique règle les trois d'un coup, et la prochaine retouche du champ
 * n'oublie personne. */

const BASE_CHAMP =
  'w-full rounded-control border border-hairline bg-[var(--field)] px-[13px] py-[11px] text-[15px] text-ink ' +
  'transition-colors placeholder:text-ink4 hover:bg-[var(--field-hover)] ' +
  'disabled:cursor-not-allowed disabled:opacity-45'

/** Étiquette de donnée — le SEUL style d'étiquette de l'application.
 *
 * Trois styles coexistent aujourd'hui, pour un même rôle :
 *   A. `text-xs font-semibold uppercase tracking-wide text-ink3`   ← la maquette
 *   B. `text-xs font-medium uppercase tracking-wide text-texte-attenue`
 *   C. `text-xs font-medium text-texte-attenue`                    (~150 usages)
 *
 * B et C sont l'héritage. La différence de graisse et de casse se voit
 * immédiatement dès que deux panneaux voisins n'ont pas le même : c'est l'une des
 * deux causes majeures de l'impression de « pas unifié », et aucun changement de
 * jeton ne la corrige — les trois pointent vers la même couleur.
 *
 * Un seul composant, un seul style. */
export function Label({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <span className={`text-xs font-semibold uppercase tracking-[0.02em] text-ink3 ${className}`}>
      {children}
    </span>
  )
}

/** Étiquette + valeur, empilées — le motif de `StatTile` et des grilles de détail
 * (fiche d'une position, aperçu immobilier, métriques). Étiquette en 12 px,
 * valeur en 22 px / 600 : c'est la valeur qui domine, jamais son étiquette. */
export function DataPoint({
  label,
  valeur,
  note,
  ton = 'neutre',
}: {
  label: string
  valeur: ReactNode
  note?: string
  ton?: 'neutre' | 'positif' | 'negatif'
}) {
  const encre = ton === 'positif' ? 'text-pos' : ton === 'negatif' ? 'text-neg' : 'text-ink'
  return (
    <div>
      <Label>{label}</Label>
      <p className={`mt-1 mb-0 text-[22px] font-semibold -tracking-[0.02em] ${encre}`}>{valeur}</p>
      {note ? <p className="mt-0.5 mb-0 text-xs text-ink3">{note}</p> : null}
    </div>
  )
}

/** Badge d'annotation — « saisie manuelle », « estimé », « clôturé »…
 * `PositionsTable` le compose encore à la main en `bg-surface-elevee` +
 * `text-texte-attenue`, à deux endroits, ce qui donne une pastille opaque dans un
 * tableau de verre. */
export function Badge({
  children,
  ton = 'neutre',
}: {
  children: ReactNode
  ton?: 'neutre' | 'accent' | 'positif' | 'negatif' | 'avertissement'
}) {
  const tons = {
    neutre: 'bg-track text-ink3',
    accent: 'bg-accent-soft text-accent',
    positif: 'bg-pos-bg text-pos',
    negatif: 'bg-neg-bg text-neg',
    avertissement: 'bg-warn-bg text-warn',
  } as const
  return (
    <span className={`inline-flex items-center rounded-chip px-2.5 py-0.5 text-xs font-medium ${tons[ton]}`}>
      {children}
    </span>
  )
}

/** Libellé + champ, empilés — le gabarit de formulaire de la maquette.
 * Libellé en 12px/600 en capitales `--ink3`, jamais au-dessus de 12px : c'est la
 * VALEUR saisie qui doit dominer, pas son étiquette. */
export function Field({
  label,
  children,
  aide,
  className = '',
}: {
  /** `ReactNode` et non `string` : un libellé peut porter une `InfoBulle` juste à
   * côté (« Prix de revient (?) »), et le composant qui la pose reste le libellé
   * lui-même — le séparer romprait l'alignement que la maquette montre. */
  label: ReactNode
  children: ReactNode
  /** Note sous le champ — 12px `--ink3`. Pour une contrainte de saisie ou une unité. */
  aide?: string
  className?: string
}) {
  return (
    <label className={`flex flex-col gap-1.5 ${className}`}>
      <Label>{label}</Label>
      {children}
      {aide ? <span className="text-xs font-normal normal-case text-ink3">{aide}</span> : null}
    </label>
  )
}

export function Input({
  className = '',
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${BASE_CHAMP} ${className}`} />
}

export function Select({
  className = '',
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props} className={`${BASE_CHAMP} ${className}`}>
      {children}
    </select>
  )
}

export function Textarea({
  className = '',
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${BASE_CHAMP} ${className}`} />
}

/** Feuille modale — le gabarit unique des maquettes (ajout d'une ligne, édition d'un
 * compte ou d'un établissement).
 *
 * Deux détails que le portage a manqués et qui se voient tout de suite :
 *  - le voile est flouté (`backdrop-blur-[6px]`), pas un simple noir à 28 % ;
 *  - la feuille s'ancre EN HAUT avec `overflow-y-auto` sur le voile, pas centrée :
 *    centrée, une feuille plus haute que la fenêtre se fait couper en haut ET en bas,
 *    hors d'atteinte du défilement. */
export function Sheet({
  children,
  onClose,
  titre,
  sousTitre,
  labelledBy,
  largeur = 'md',
}: {
  children: ReactNode
  onClose: () => void
  titre: string
  sousTitre?: string
  labelledBy: string
  /** `md` = 480px (édition), `lg` = 520px (formulaires à deux colonnes). */
  largeur?: 'md' | 'lg'
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[rgba(10,11,14,0.28)] p-6 backdrop-blur-[6px]"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        onClick={(e) => e.stopPropagation()}
        className={`w-full ${largeur === 'lg' ? 'max-w-[520px]' : 'max-w-[480px]'} rounded-[24px] border border-stroke bg-panel-hi px-[26px] py-6 shadow-glass-lg backdrop-blur-glass backdrop-saturate-[1.8]`}
      >
        <div className="flex items-start gap-3.5">
          <div>
            <h2 id={labelledBy} className="m-0 text-[22px] font-semibold -tracking-[0.02em] text-ink">
              {titre}
            </h2>
            {sousTitre ? <p className="mt-1.5 mb-0 text-[13px] text-ink3">{sousTitre}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="ml-auto flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-chip bg-track text-ink3 transition-colors hover:bg-hover"
          >
            <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M5.5 5.5 L14.5 14.5 M14.5 5.5 L5.5 14.5" />
            </svg>
          </button>
        </div>
        <div className="mt-5">{children}</div>
      </div>
    </div>
  )
}

/** Pied de feuille modale — « Annuler » à gauche, action primaire qui prend le reste
 * de la largeur. Le bouton primaire d'une feuille est DÉSACTIVÉ tant que la saisie est
 * incomplète (fond `--track`, encre `--ink4`), jamais masqué. */
export function SheetActions({ children }: { children: ReactNode }) {
  return <div className="mt-5 flex gap-2.5">{children}</div>
}
