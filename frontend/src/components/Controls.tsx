import type { ReactNode } from 'react'

/** Contrôle segmenté — la pastille glissante d'iOS (paquet de design du 05/09/2026,
 * étape 2). Remplace partout les rangées de boutons `bg-texte text-surface` de
 * l'application : vue net/brut/financier, période, filtres de type d'actif,
 * mensuel/annuel, onglets de la fiche d'une position et des Réglages.
 *
 * `semantique` — écart assumé au composant livré par le paquet, qui posait
 * `role="tablist"`/`role="tab"` partout. Un `tab` n'est correct que s'il pilote un
 * `tabpanel` : c'est le cas des onglets d'un écran, jamais d'un filtre (« Actions /
 * ETF / Crypto ») ni d'une bascule de vue, qui sont des boutons à état et doivent
 * annoncer `aria-pressed`. Poser `tab` partout aurait annoncé des onglets là où il
 * n'y en a pas — et fait perdre l'information « activé » à un lecteur d'écran.
 * D'où deux modes, `filtre` par défaut. */
export function SegmentedControl<T extends string>({
  options,
  valeur,
  onChange,
  taille = 'md',
  ariaLabel,
  semantique = 'filtre',
  idOnglet,
  idPanneau,
  className = '',
}: {
  /** `libelle` accepte un nœud React : les onglets des Réglages portent une icône
   * devant leur texte, et la refonte ne demandait pas de la leur retirer. */
  /** `desactive` : option visible mais inopérante (ex. « Plus-value » sans point
   * antérieur connu pour la déduire). Rendue `disabled` et non masquée — une option
   * qui disparaît laisse croire qu'elle n'existe pas, là où `disabled` + `aide`
   * explique POURQUOI elle est hors d'atteinte. */
  options: { valeur: T; libelle: ReactNode; aide?: string; desactive?: boolean }[]
  valeur: T
  onChange: (v: T) => void
  taille?: 'sm' | 'md'
  ariaLabel?: string
  semantique?: 'filtre' | 'onglets'
  /** Câblage onglet ↔ panneau (`id` / `aria-controls`), en mode `onglets` seulement :
   * sans lui, un lecteur d'écran voit des onglets sans savoir ce qu'ils pilotent. */
  idOnglet?: (valeur: T) => string
  idPanneau?: (valeur: T) => string
  className?: string
}) {
  // Cible tactile de 44 px sur mobile, 26 px à partir de `md` (refonte, étape 5) :
  // « 44 px minimum pour toute cible tactile, sans exception » — c'est le point le
  // plus facile à casser au portage, et une pilule de 26 px de haut est confortable
  // à la souris mais ratée au pouce.
  const pad =
    taille === 'sm'
      ? 'min-h-11 px-3 text-xs md:min-h-0 md:py-[5px]'
      : 'min-h-11 px-3.5 text-[13px] md:min-h-0 md:py-[5px]'
  const onglets = semantique === 'onglets'
  return (
    <div
      role={onglets ? 'tablist' : 'group'}
      aria-label={ariaLabel}
      className={`flex gap-0.5 rounded-chip bg-track p-0.5 ${className}`}
    >
      {options.map((o) => {
        const actif = o.valeur === valeur
        return (
          <button
            key={o.valeur}
            type="button"
            role={onglets ? 'tab' : undefined}
            id={onglets ? idOnglet?.(o.valeur) : undefined}
            aria-selected={onglets ? actif : undefined}
            aria-controls={onglets ? idPanneau?.(o.valeur) : undefined}
            aria-pressed={onglets ? undefined : actif}
            disabled={o.desactive}
            title={o.aide}
            onClick={() => onChange(o.valeur)}
            className={`rounded-chip whitespace-nowrap ${pad} transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
              actif
                ? 'bg-[var(--on-bg)] font-semibold text-[var(--on-ink)] shadow-[0_1px_3px_rgba(20,26,40,0.14)]'
                : 'font-medium text-ink3 hover:text-ink'
            }`}
          >
            {o.libelle}
          </button>
        )
      })}
    </div>
  )
}

/** Pilule d'action ou de contexte — le seul autre contrôle de la barre du haut. */
export function Pill({
  children,
  onClick,
  icone,
  ariaLabel,
  actif,
  title,
  className = '',
}: {
  children: ReactNode
  onClick?: () => void
  icone?: ReactNode
  ariaLabel?: string
  /** Pilule à deux états (ex. « Mode étagé ») : pose le fond d'accent et `aria-pressed`
   * — y compris `false`, qui est l'information utile pour un lecteur d'écran (« bouton
   * à bascule, non activé »). Omis pour une pilule de simple contexte, qui n'est pas
   * une bascule. */
  actif?: boolean
  title?: string
  className?: string
}) {
  // Même règle des 44 px que le contrôle segmenté (refonte, étape 5).
  const classes = `flex min-h-11 items-center gap-[7px] rounded-chip border px-3 text-[13px] transition-colors md:min-h-0 md:py-[5px] ${
    actif ? 'border-transparent bg-accent-soft text-accent' : 'border-hairline bg-chip text-ink2 hover:bg-hover'
  } ${className}`
  if (!onClick) {
    return (
      <span className={classes} aria-label={ariaLabel} title={title}>
        {icone}
        {children}
      </span>
    )
  }
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      aria-pressed={actif}
      title={title}
      className={classes}
    >
      {icone}
      {children}
    </button>
  )
}

/** Classes des deux boutons, exportées séparément parce qu'un TÉLÉCHARGEMENT doit
 * rester une balise `<a href download>` — c'est le navigateur qui le déclenche, pas
 * du JavaScript — et ne peut donc pas passer par les composants ci-dessous. Une
 * constante partagée plutôt qu'une copie des classes chez chaque appelant : sinon la
 * prochaine retouche du bouton oublie les liens. */
export const CLASSES_BOUTON_PRIMAIRE =
  'inline-flex min-h-11 items-center justify-center gap-1.5 rounded-control bg-[image:var(--accent-grad)] px-4 text-sm font-semibold text-white shadow-accent transition-colors md:min-h-0 md:py-2'

export const CLASSES_BOUTON_SECONDAIRE =
  'inline-flex min-h-11 items-center justify-center gap-1.5 rounded-control border border-hairline bg-chip px-3.5 text-sm font-medium text-ink2 transition-colors hover:bg-hover md:min-h-0 md:py-2'

/** Bouton primaire — dégradé d'accent + halo. Un seul par écran. */
export function PrimaryButton({
  children,
  onClick,
  icone,
  type = 'button',
  disabled = false,
  className = '',
  title,
}: {
  children: ReactNode
  onClick?: () => void
  icone?: ReactNode
  type?: 'button' | 'submit'
  disabled?: boolean
  className?: string
  title?: string
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`flex min-h-11 items-center justify-center gap-1.5 rounded-control px-4 text-sm font-semibold transition-colors md:min-h-0 md:py-2 ${
        disabled
          ? 'cursor-not-allowed bg-track text-ink4'
          : 'bg-[image:var(--accent-grad)] text-white shadow-accent'
      } ${className}`}
    >
      {icone}
      {children}
    </button>
  )
}

/** Bouton secondaire — verre teinté, jamais de bordure sombre. */
export function SecondaryButton({
  children,
  onClick,
  icone,
  type = 'button',
  disabled = false,
  className = '',
  title,
}: {
  children: ReactNode
  onClick?: () => void
  icone?: ReactNode
  type?: 'button' | 'submit'
  disabled?: boolean
  className?: string
  title?: string
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`flex min-h-11 items-center justify-center gap-1.5 rounded-control border border-hairline bg-chip px-3.5 text-sm font-medium text-ink2 transition-colors hover:bg-hover disabled:opacity-40 md:min-h-0 md:py-2 ${className}`}
    >
      {icone}
      {children}
    </button>
  )
}

/** Badge de variation — remplace les `text-positif` / `text-negatif` épars. */
export function DeltaBadge({ valeur, positif }: { valeur: string; positif: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-chip px-2.5 py-1 text-[13px] font-semibold ${
        positif ? 'bg-pos-bg text-pos' : 'bg-neg-bg text-neg'
      }`}
    >
      {valeur}
    </span>
  )
}
