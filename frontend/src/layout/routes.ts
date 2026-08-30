import type { ComponentType } from 'react'
import type { Role } from '../api/types'
import {
  IconAide,
  IconBudget,
  IconDividendes,
  IconEpargne,
  IconImport,
  IconObjectifs,
  IconPatrimoine,
  IconRapport,
  IconReglages,
  IconSalaire,
  IconSynthese,
} from '../components/icons'

export type Rang = 'consultation' | 'administration'

export type RouteMeta = {
  path: string
  /** Suffixe du titre d'onglet (`document.title`), et libellé par défaut du fil
   * d'Ariane — source unique pour ne plus jamais désynchroniser URL, libellé de
   * navigation et titre d'onglet (backlog 2.K.2). */
  titre: string
  /** Libellé affiché dans la barre latérale, la barre inférieure ou le menu du
   * compte. Absent pour les routes qui n'apparaissent dans aucun menu (ex. la
   * fiche détaillée d'une position). */
  navLabel?: string
  /** Icône assortie au libellé, affichée par tous les menus (barre latérale,
   * barre inférieure, feuille "Plus", menu du compte) — un seul endroit à éditer
   * par écran plutôt que la même correspondance recopiée dans chacun de ces
   * composants (source de l'incohérence relevée à l'audit du 30/08/2026 : une
   * entrée « Analyse » orpheline y survivait dans 3 fichiers depuis le retrait de
   * cette route le 25/08/2026, sans qu'aucun de ces fichiers ne le signale).
   * Absent si `navLabel` l'est aussi. */
  icone?: ComponentType<{ className?: string }>
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

/** Source unique de vérité pour la navigation (backlog 2.K.2, durci le
 * 30/08/2026) : URL, libellé, icône et titre d'onglet d'un même écran s'éditent
 * ici en un seul endroit. `App.tsx` construit désormais ses `<Route>` en itérant
 * ce tableau (voir `PAGE_COMPONENTS`) plutôt que de maintenir une seconde liste de
 * routes à la main : un écran absent d'ici n'est plus seulement absent des menus,
 * il n'est plus accessible par son URL non plus — la seule façon d'ajouter un
 * écran qui fonctionne est donc de l'ajouter ici, ce qui rend l'oubli
 * structurellement impossible plutôt que dépendant de la discipline du
 * développeur. */
export const ROUTES: RouteMeta[] = [
  { path: '/', titre: 'Synthèse', navLabel: 'Synthèse', icone: IconSynthese, rang: 'consultation' },
  { path: '/patrimoine', titre: 'Patrimoine', navLabel: 'Patrimoine', icone: IconPatrimoine, rang: 'consultation' },
  { path: '/patrimoine/:ticker', titre: 'Détail de la position' },
  {
    path: '/objectifs',
    titre: 'Objectifs',
    navLabel: 'Objectifs',
    icone: IconObjectifs,
    rang: 'consultation',
    rolesAutorises: ['proprietaire'],
  },
  // `BottomNav` ne montre en direct que les 4 premières routes de consultation
  // (`MAX_ENTREES_DIRECTES`) : Synthèse/Patrimoine/Objectifs/Épargne, le reste
  // rejoint "Plus" (backlog 2.S.1).
  { path: '/epargne', titre: 'Épargne', navLabel: 'Épargne', icone: IconEpargne, rang: 'consultation' },
  {
    path: '/dividendes',
    titre: 'Dividendes',
    navLabel: 'Dividendes',
    icone: IconDividendes,
    rang: 'consultation',
    rolesAutorises: ['proprietaire', 'membre'],
  },
  {
    path: '/budget',
    titre: 'Budget',
    navLabel: 'Budget',
    icone: IconBudget,
    rang: 'consultation',
    rolesAutorises: ['proprietaire', 'membre'],
  },
  {
    path: '/rapport',
    titre: 'Rapport',
    navLabel: 'Rapport',
    icone: IconRapport,
    rang: 'consultation',
    rolesAutorises: ['proprietaire', 'membre'],
  },
  {
    path: '/salaire',
    titre: 'Salaire',
    navLabel: 'Salaire',
    icone: IconSalaire,
    rang: 'consultation',
    rolesAutorises: ['proprietaire'],
  },
  {
    path: '/import',
    titre: 'Import',
    navLabel: 'Import',
    icone: IconImport,
    rang: 'administration',
    rolesAutorises: ['proprietaire', 'membre'],
  },
  {
    path: '/reglages',
    titre: 'Réglages',
    navLabel: 'Réglages',
    icone: IconReglages,
    rang: 'administration',
    rolesAutorises: ['proprietaire'],
  },
  { path: '/aide', titre: 'Aide', navLabel: 'Aide', icone: IconAide, rang: 'administration' },
]

export function routesDuRang(rang: Rang, role?: Role): RouteMeta[] {
  return ROUTES.filter((r) => r.rang === rang && (!r.rolesAutorises || !role || r.rolesAutorises.includes(role)))
}
