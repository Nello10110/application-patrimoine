import type { Role } from '../api/types'

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
  /** Rôles autorisés à voir cette entrée de navigation (backlog 2.L.2) — reflète
   * les restrictions déjà appliquées côté serveur (`main.py`), en gardant le menu
   * cohérent avec ce que l'API accepterait réellement. Absent = tous les rôles
   * connectés (propriétaire/membre/invité). Purement une aide d'affichage : la
   * vraie frontière de sécurité reste le backend, jamais ce filtre client. */
  rolesAutorises?: Role[]
}

/** Source unique de vérité pour la navigation (backlog 2.K.2) : URL, libellé et
 * titre d'onglet d'un même écran s'éditent ici en un seul endroit, plutôt que
 * dans trois fichiers séparés qui peuvent diverger. */
export const ROUTES: RouteMeta[] = [
  { path: '/', titre: 'Synthèse', navLabel: 'Synthèse', rang: 'consultation' },
  { path: '/patrimoine', titre: 'Patrimoine', navLabel: 'Patrimoine', rang: 'consultation' },
  { path: '/patrimoine/:ticker', titre: 'Détail de la position' },
  { path: '/analyse', titre: 'Analyse', navLabel: 'Analyse', rang: 'consultation', rolesAutorises: ['proprietaire', 'membre'] },
  { path: '/objectifs', titre: 'Objectifs', navLabel: 'Objectifs', rang: 'consultation', rolesAutorises: ['proprietaire'] },
  { path: '/dividendes', titre: 'Dividendes', navLabel: 'Dividendes', rang: 'consultation', rolesAutorises: ['proprietaire', 'membre'] },
  { path: '/budget', titre: 'Budget', navLabel: 'Budget', rang: 'consultation', rolesAutorises: ['proprietaire', 'membre'] },
  { path: '/rapport', titre: 'Rapport', navLabel: 'Rapport', rang: 'consultation', rolesAutorises: ['proprietaire', 'membre'] },
  { path: '/salaire', titre: 'Salaire', navLabel: 'Salaire', rang: 'consultation', rolesAutorises: ['proprietaire'] },
  { path: '/import', titre: 'Import', navLabel: 'Import', rang: 'administration', rolesAutorises: ['proprietaire', 'membre'] },
  { path: '/reglages', titre: 'Réglages', navLabel: 'Réglages', rang: 'administration', rolesAutorises: ['proprietaire'] },
  { path: '/aide', titre: 'Aide', navLabel: 'Aide', rang: 'administration' },
]

export function routesDuRang(rang: Rang, role?: Role): RouteMeta[] {
  return ROUTES.filter((r) => r.rang === rang && (!r.rolesAutorises || !role || r.rolesAutorises.includes(role)))
}
