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
  options: { valeur: T; libelle: ReactNode; aide?: string }[]
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
  const pad = taille === 'sm' ? 'px-3 py-[5px] text-xs' : 'px-3.5 py-[5px] text-[13px]'
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
            title={o.aide}
            onClick={() => onChange(o.valeur)}
            className={`rounded-chip whitespace-nowrap ${pad} transition-colors ${
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
  actif = false,
  title,
}: {
  children: ReactNode
  onClick?: () => void
  icone?: ReactNode
  ariaLabel?: string
  /** Pilule à deux états (ex. « Mode étagé ») : pose `aria-pressed` et le fond d'accent. */
  actif?: boolean
  title?: string
}) {
  const classes = `flex items-center gap-[7px] rounded-chip border px-3 py-[5px] text-[13px] transition-colors ${
    actif ? 'border-transparent bg-accent-soft text-accent' : 'border-hairline bg-chip text-ink2 hover:bg-hover'
  }`
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
      aria-pressed={actif || undefined}
      title={title}
      className={classes}
    >
      {icone}
      {children}
    </button>
  )
}

/** Bouton primaire — dégradé d'accent + halo. Un seul par écran. */
export function PrimaryButton({
  children,
  onClick,
  icone,
  type = 'button',
  disabled = false,
  className = '',
}: {
  children: ReactNode
  onClick?: () => void
  icone?: ReactNode
  type?: 'button' | 'submit'
  disabled?: boolean
  className?: string
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center justify-center gap-1.5 rounded-control px-4 py-2 text-sm font-semibold transition-colors ${
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
}: {
  children: ReactNode
  onClick?: () => void
  icone?: ReactNode
  type?: 'button' | 'submit'
  disabled?: boolean
  className?: string
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center justify-center gap-1.5 rounded-control border border-hairline bg-chip px-3.5 py-2 text-sm font-medium text-ink2 transition-colors hover:bg-hover disabled:opacity-40 ${className}`}
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
