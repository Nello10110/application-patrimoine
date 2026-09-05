// Bibliothèque d'icônes trait (20px, `currentColor`) de l'application (backlog
// 2.K.1), tracées à la main plutôt que via une dépendance tierce — remplace les
// émojis d'interface (navigation, bascule de thème) et les symboles Unicode ad hoc
// (✕ ↗ ← → ✓) utilisés jusqu'ici comme icônes.

type IconProps = { className?: string }

const base = {
  width: 20,
  height: 20,
  viewBox: '0 0 20 20',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
}

export function IconSynthese({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M3 10 L10 3.5 L17 10" />
      <path d="M5 8.5 V16 H15 V8.5" />
      <path d="M8 16 V11.5 H12 V16" />
    </svg>
  )
}

export function IconPatrimoine({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <rect x="3" y="5.5" width="14" height="10" rx="1.6" />
      <path d="M3 8.5 H17" />
      <path d="M13 12 H14.4" />
    </svg>
  )
}

export function IconComptes({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <rect x="2.5" y="5" width="15" height="11" rx="1.6" />
      <path d="M2.5 8.5 H17.5" />
      <circle cx="13.5" cy="12.5" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function IconObjectifs({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <circle cx="10" cy="10" r="6.5" />
      <circle cx="10" cy="10" r="3.4" />
      <circle cx="10" cy="10" r="0.6" fill="currentColor" />
    </svg>
  )
}

export function IconDividendes({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <circle cx="8" cy="8" r="4.7" />
      <path d="M9.8 12.3 A4.7 4.7 0 1 0 9.8 3.7" />
    </svg>
  )
}

export function IconRapport({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M6 3 H12 L15 6 V17 H6 Z" />
      <path d="M12 3 V6 H15" />
      <path d="M8.2 10 H12.8 M8.2 12.6 H12.8" />
    </svg>
  )
}

export function IconBudget({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M3.5 6.5 A2 2 0 0 1 5.5 4.5 H14.5 A2 2 0 0 1 16.5 6.5 V14.5 A2 2 0 0 1 14.5 16.5 H5.5 A2 2 0 0 1 3.5 14.5 Z" />
      <path d="M12.5 9.5 H16.5 V12.5 H12.5 A1.5 1.5 0 0 1 12.5 9.5 Z" />
    </svg>
  )
}

export function IconSalaire({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <rect x="2.5" y="6" width="15" height="9" rx="1.4" />
      <circle cx="10" cy="10.5" r="2.3" />
      <path d="M5 6 V4.5 H15 V6" />
    </svg>
  )
}

export function IconImport({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M10 13 V4" />
      <path d="M6.2 7.6 L10 4 L13.8 7.6" />
      <path d="M4 14.5 V16 H16 V14.5" />
    </svg>
  )
}

export function IconReglages({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <circle cx="10" cy="10" r="2.6" />
      <path d="M10 3.4 V5.2 M10 14.8 V16.6 M16.6 10 H14.8 M5.2 10 H3.4 M14.8 5.2 L13.5 6.5 M6.5 13.5 L5.2 14.8 M14.8 14.8 L13.5 13.5 M6.5 6.5 L5.2 5.2" />
    </svg>
  )
}

export function IconAide({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <circle cx="10" cy="10" r="6.8" />
      <path d="M7.8 8 A2.2 2.2 0 1 1 10 10.4 V11.6" />
      <circle cx="10" cy="14.2" r="0.15" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function IconChevron({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M12.5 4.5 L7 10 L12.5 15.5" />
    </svg>
  )
}

export function IconOeil({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M2.5 10 C4.5 5.5 7 3.5 10 3.5 C13 3.5 15.5 5.5 17.5 10 C15.5 14.5 13 16.5 10 16.5 C7 16.5 4.5 14.5 2.5 10 Z" />
      <circle cx="10" cy="10" r="2.8" />
    </svg>
  )
}

export function IconOeilBarre({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M2.5 10 C4.5 5.5 7 3.5 10 3.5 C13 3.5 15.5 5.5 17.5 10 C15.5 14.5 13 16.5 10 16.5 C7 16.5 4.5 14.5 2.5 10 Z" />
      <circle cx="10" cy="10" r="2.8" />
      <path d="M3.5 16.5 L16.5 3.5" />
    </svg>
  )
}

export function IconDeconnexion({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M8.5 3.5 H5 A1.5 1.5 0 0 0 3.5 5 V15 A1.5 1.5 0 0 0 5 16.5 H8.5" />
      <path d="M9 10 H16.5 M13.5 7 L16.5 10 L13.5 13" />
    </svg>
  )
}

export function IconFermer({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M5 5 L15 15 M15 5 L5 15" />
    </svg>
  )
}

export function IconLienExterne({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M8.5 4.5 H15.5 V11.5" />
      <path d="M15.5 4.5 L8 12" />
      <path d="M12.5 9.5 V15 A1 1 0 0 1 11.5 16 H5 A1 1 0 0 1 4 15 V8.5 A1 1 0 0 1 5 7.5 H10.5" />
    </svg>
  )
}

export function IconPartage({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <circle cx="5" cy="10" r="2.2" />
      <circle cx="14.5" cy="4.5" r="2.2" />
      <circle cx="14.5" cy="15.5" r="2.2" />
      <path d="M7 9 L12.5 5.5 M7 11 L12.5 14.5" />
    </svg>
  )
}

export function IconFlecheGauche({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M16 10 H4.5 M9.5 4.5 L4 10 L9.5 15.5" />
    </svg>
  )
}

export function IconFlecheDroite({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M4 10 H15.5 M10.5 4.5 L16 10 L10.5 15.5" />
    </svg>
  )
}

export function IconSoleil({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <circle cx="10" cy="10" r="3.2" />
      <path d="M10 2.8 V4.6 M10 15.4 V17.2 M17.2 10 H15.4 M4.6 10 H2.8 M15 5 L13.7 6.3 M6.3 13.7 L5 15 M15 15 L13.7 13.7 M6.3 6.3 L5 5" />
    </svg>
  )
}

export function IconLune({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M16.2 12.3 A6.8 6.8 0 1 1 7.7 3.8 A5.4 5.4 0 0 0 16.2 12.3 Z" />
    </svg>
  )
}

export function IconEcran({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <rect x="3" y="4" width="14" height="9.5" rx="1.2" />
      <path d="M7.5 16.5 H12.5 M10 13.5 V16.5" />
    </svg>
  )
}

export function IconPersonne({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <circle cx="10" cy="7" r="3.2" />
      <path d="M4 16.5 C4 12.9 6.7 11 10 11 C13.3 11 16 12.9 16 16.5" />
    </svg>
  )
}

export function IconBouclier({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M10 3 L16 5.3 V9.5 C16 13.3 13.4 16.2 10 17.3 C6.6 16.2 4 13.3 4 9.5 V5.3 Z" />
      <path d="M7.5 10 L9.2 11.7 L12.7 8" />
    </svg>
  )
}

export function IconHorloge({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <circle cx="10" cy="10" r="6.8" />
      <path d="M10 6 V10 L12.8 12" />
    </svg>
  )
}

// Trois points horizontaux ("plus d'options") — pas un "+" : nom choisi pour éviter
// la confusion avec une icône d'ajout (déjà couverte ailleurs par du texte, ex.
// "Ajouter").
export function IconPlusOptions({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <circle cx="5.2" cy="10" r="1.15" fill="currentColor" stroke="none" />
      <circle cx="10" cy="10" r="1.15" fill="currentColor" stroke="none" />
      <circle cx="14.8" cy="10" r="1.15" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function IconRecherche({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <circle cx="8.5" cy="8.5" r="5.5" />
      <path d="M16.5 16.5 L12.7 12.7" />
    </svg>
  )
}

// Établissement financier générique (fronton + colonnes) — badge neutre d'un
// établissement personnalisé sans logo connu, cf. `EtablissementLogo.tsx`.
export function IconEtablissement({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M3 8 L10 3.5 L17 8" />
      <path d="M3 8.8 H17" />
      <path d="M5.5 10.5 V15" />
      <path d="M10 10.5 V15" />
      <path d="M14.5 10.5 V15" />
      <path d="M3 15.8 H17" />
    </svg>
  )
}
