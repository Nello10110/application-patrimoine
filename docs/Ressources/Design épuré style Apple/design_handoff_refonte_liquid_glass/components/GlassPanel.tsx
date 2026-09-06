import { type ReactNode } from 'react';

type Niveau = 'panel' | 'hero';

/**
 * Le panneau de verre — remplace l'actuel <Card> (bg-white + border-slate-200 + shadow-sm).
 * Un seul composant pour toutes les surfaces : `hero` est réservé au bloc principal
 * d'un écran (un seul par écran), `panel` à tout le reste.
 */
export function GlassPanel({
  children,
  niveau = 'panel',
  className = '',
  as: Tag = 'div',
}: {
  children: ReactNode;
  niveau?: Niveau;
  className?: string;
  as?: 'div' | 'section' | 'aside';
}) {
  const fond = niveau === 'hero' ? 'bg-panel-hi shadow-glass-lg' : 'bg-panel shadow-glass';
  const rayon = niveau === 'hero' ? 'rounded-hero' : 'rounded-panel';
  return (
    <Tag
      className={`${rayon} ${fond} border border-stroke backdrop-blur-glass backdrop-saturate-[1.8] ${className}`}
    >
      {children}
    </Tag>
  );
}

/**
 * En-tête de panneau. Remarque de design : le titre est en 15px/600 en encre pleine —
 * plus les petites capitales gris clair de l'ancienne <Card title>, qui rendaient
 * chaque section aussi importante (donc aucune).
 */
export function PanelHeader({
  titre,
  action,
}: {
  titre: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 border-b border-hairline px-5 py-3.5">
      <p className="m-0 text-[15px] font-semibold -tracking-[0.01em] text-ink">{titre}</p>
      {action ? <div className="ml-auto">{action}</div> : null}
    </div>
  );
}

/** Ligne de liste — le motif unique pour comptes, mouvements, dividendes, jalons. */
export function PanelRow({
  children,
  onClick,
  derniere = false,
}: {
  children: ReactNode;
  onClick?: () => void;
  derniere?: boolean;
}) {
  const base = `flex w-full items-center gap-3 px-5 py-3 text-left ${
    derniere ? '' : 'border-b border-hairline'
  }`;
  if (!onClick) return <div className={base}>{children}</div>;
  return (
    <button type="button" onClick={onClick} className={`${base} hover:bg-[var(--hover)]`}>
      {children}
    </button>
  );
}
