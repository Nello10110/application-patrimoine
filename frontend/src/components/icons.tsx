// Jeu minimal d'icônes trait (20px, `currentColor`), tracées à la main pour les
// besoins de la barre latérale et du menu du compte (backlog 2.K.2) — remplace les
// émojis utilisés jusqu'ici pour la navigation. Portée volontairement limitée à ces
// deux composants : la bibliothèque d'icônes unique pour le reste de l'application
// reste à traiter (backlog 2.K.1).

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

export function IconAnalyse({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M10 10 V3 A7 7 0 0 1 17 10 Z" />
      <path d="M10 10 L4.3 13.5 A7 7 0 1 1 10 3" />
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
