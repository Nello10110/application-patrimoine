export type Rang = 'consultation' | 'administration'

export type RouteMeta = {
  path: string
  /** Suffixe du titre d'onglet (`document.title`), et libellé par défaut du fil
   * d'Ariane à venir — source unique pour ne plus jamais désynchroniser URL,
   * libellé de navigation et titre d'onglet (backlog 2.K.2). */
  titre: string
  /** Libellé affiché dans la barre latérale ou le menu du compte. Absent pour les
   * routes qui n'apparaissent dans aucun menu (ex. la fiche détaillée d'une
   * position). */
  navLabel?: string
  /** Rang d'affichage : `consultation` dans la barre latérale, `administration`
   * dans le menu du compte. Absent = route sans entrée de menu. */
  rang?: Rang
}

/** Source unique de vérité pour la navigation (backlog 2.K.2) : URL, libellé et
 * titre d'onglet d'un même écran s'éditent ici en un seul endroit, plutôt que
 * dans trois fichiers séparés qui peuvent diverger. */
export const ROUTES: RouteMeta[] = [
  { path: '/', titre: 'Synthèse', navLabel: 'Synthèse', rang: 'consultation' },
  { path: '/patrimoine', titre: 'Patrimoine', navLabel: 'Patrimoine', rang: 'consultation' },
  { path: '/patrimoine/:ticker', titre: 'Détail de la position' },
  { path: '/analyse', titre: 'Analyse', navLabel: 'Analyse', rang: 'consultation' },
  { path: '/objectifs', titre: 'Objectifs', navLabel: 'Objectifs', rang: 'consultation' },
  { path: '/dividendes', titre: 'Dividendes', navLabel: 'Dividendes', rang: 'consultation' },
  { path: '/rapport', titre: 'Rapport', navLabel: 'Rapport', rang: 'consultation' },
  { path: '/import', titre: 'Import', navLabel: 'Import', rang: 'administration' },
  { path: '/reglages', titre: 'Réglages', navLabel: 'Réglages', rang: 'administration' },
  { path: '/aide', titre: 'Aide', navLabel: 'Aide', rang: 'administration' },
]

export function routesDuRang(rang: Rang): RouteMeta[] {
  return ROUTES.filter((r) => r.rang === rang)
}
