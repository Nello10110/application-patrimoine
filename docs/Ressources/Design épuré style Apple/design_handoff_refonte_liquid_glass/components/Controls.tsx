import { type ReactNode } from 'react';

/**
 * Contrôle segmenté — la pastille glissante d'iOS.
 * Remplace partout les rangées de boutons `bg-slate-900 text-white` de l'app actuelle :
 * Vue net/brut/financier, période 1M…Tout, filtres de type d'actif, mensuel/annuel.
 */
export function SegmentedControl<T extends string>({
  options,
  valeur,
  onChange,
  taille = 'md',
  ariaLabel,
}: {
  options: { valeur: T; libelle: string }[];
  valeur: T;
  onChange: (v: T) => void;
  taille?: 'sm' | 'md';
  ariaLabel?: string;
}) {
  const pad = taille === 'sm' ? 'px-3 py-[5px] text-xs' : 'px-3.5 py-[5px] text-[13px]';
  return (
    <div role="tablist" aria-label={ariaLabel} className="flex gap-0.5 rounded-chip bg-track p-0.5">
      {options.map((o) => {
        const actif = o.valeur === valeur;
        return (
          <button
            key={o.valeur}
            type="button"
            role="tab"
            aria-selected={actif}
            onClick={() => onChange(o.valeur)}
            className={`rounded-chip ${pad} transition-colors ${
              actif
                ? 'bg-[var(--on-bg)] font-semibold text-[var(--on-ink)] shadow-[0_1px_3px_rgba(20,26,40,0.14)]'
                : 'font-medium text-ink3 hover:text-ink'
            }`}
          >
            {o.libelle}
          </button>
        );
      })}
    </div>
  );
}

/** Pilule d'action ou de contexte — le seul autre contrôle de la barre du haut. */
export function Pill({
  children,
  onClick,
  icone,
}: {
  children: ReactNode;
  onClick?: () => void;
  icone?: ReactNode;
}) {
  const Tag = onClick ? 'button' : 'span';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className="flex items-center gap-[7px] rounded-chip border border-hairline bg-chip px-3 py-[5px] text-[13px] text-ink2 hover:bg-[var(--hover)]"
    >
      {icone}
      {children}
    </Tag>
  );
}

/** Bouton primaire — dégradé d'accent + halo. Un seul par écran. */
export function PrimaryButton({
  children,
  onClick,
  icone,
}: {
  children: ReactNode;
  onClick?: () => void;
  icone?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-control bg-[image:var(--accent-grad)] px-4 py-2 text-sm font-semibold text-white shadow-accent"
    >
      {icone}
      {children}
    </button>
  );
}

/** Bouton secondaire — verre teinté, jamais de bordure sombre. */
export function SecondaryButton({
  children,
  onClick,
  icone,
}: {
  children: ReactNode;
  onClick?: () => void;
  icone?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-control border border-hairline bg-chip px-3.5 py-2 text-sm font-medium text-ink2 hover:bg-[var(--hover)]"
    >
      {icone}
      {children}
    </button>
  );
}

/** Badge de variation — remplace les `text-emerald-700` / `text-red-600` épars. */
export function DeltaBadge({ valeur, positif }: { valeur: string; positif: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-chip px-2.5 py-1 text-[13px] font-semibold ${
        positif ? 'bg-pos-bg text-pos' : 'bg-neg-bg text-neg'
      }`}
    >
      {valeur}
    </span>
  );
}
