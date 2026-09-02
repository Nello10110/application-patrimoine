import { lazy, type ComponentType } from 'react'

// Découpage par route (LOT 4.8) : `recharts` (utilisé par le Tableau de bord et la
// fiche détaillée d'une position) pesait à lui seul une bonne part du bundle unique
// d'origine (~690 ko), chargé même sur les pages qui n'affichent aucun graphique
// (Portefeuille, Import, Réglages). `React.lazy` fait charger le code de chaque
// page à la demande (au moment de la navigation) plutôt que tout d'un bloc au
// premier chargement de l'application.
const AidePage = lazy(() => import('../pages/AidePage'))
const BudgetPage = lazy(() => import('../pages/BudgetPage'))
const CompteDetailPage = lazy(() => import('../pages/CompteDetailPage'))
const ComptesPage = lazy(() => import('../pages/ComptesPage'))
const DashboardPage = lazy(() => import('../pages/DashboardPage'))
const DividendesPage = lazy(() => import('../pages/DividendesPage'))
const EpargnePage = lazy(() => import('../pages/EpargnePage'))
const HoldingDetailPage = lazy(() => import('../pages/HoldingDetailPage'))
const ImportPage = lazy(() => import('../pages/ImportPage'))
const PortefeuillePage = lazy(() => import('../pages/PortefeuillePage'))
const RapportPage = lazy(() => import('../pages/RapportPage'))
const ReglagesPage = lazy(() => import('../pages/ReglagesPage'))
const SalairePage = lazy(() => import('../pages/SalairePage'))
const SimulateurPage = lazy(() => import('../pages/SimulateurPage'))

// Association chemin -> composant (audit menus du 30/08/2026) : `ROUTES`
// (`routes.ts`) reste la seule liste de chemins à maintenir — `App.tsx` génère son
// `<Routes>` en itérant `ROUTES` et en résolvant chaque chemin ici, plutôt que de
// recopier une seconde liste de routes à la main en parallèle. Un chemin de
// `ROUTES` sans entrée ici resterait accessible par aucune URL malgré son
// éventuelle entrée de menu ; `routes.test.ts` verrouille que les deux couvrent
// exactement les mêmes chemins. `/objectifs` pointe vers `SimulateurPage`, seule
// association qui ne se déduit pas du nom de la route (fusion Simulateur/Objectifs,
// cf. backlog B.1). Fichier séparé de `routes.ts` (qui reste des métadonnées pures,
// sans dépendance sur les composants de page) et de `App.tsx` (dont l'export d'une
// simple constante à côté du composant `App` cassait le fast-refresh).
export const PAGE_COMPONENTS: Partial<Record<string, ComponentType>> = {
  '/': DashboardPage,
  '/patrimoine': PortefeuillePage,
  '/patrimoine/:ticker': HoldingDetailPage,
  '/comptes': ComptesPage,
  '/comptes/:id': CompteDetailPage,
  '/objectifs': SimulateurPage,
  '/epargne': EpargnePage,
  '/dividendes': DividendesPage,
  '/budget': BudgetPage,
  '/rapport': RapportPage,
  '/salaire': SalairePage,
  '/import': ImportPage,
  '/reglages': ReglagesPage,
  '/aide': AidePage,
}
