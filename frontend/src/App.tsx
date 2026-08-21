import { Suspense, lazy, useEffect } from 'react'
import { Navigate, Route, Routes, matchPath, useLocation, useParams } from 'react-router-dom'
import BarreControles from './components/BarreControles'
import Sidebar from './components/Sidebar'
import { AuthProvider } from './contexts/AuthContext'
import { PreferencesAffichageProvider } from './contexts/PreferencesAffichageContext'
import { useAuth } from './hooks/useAuth'
import { ROUTES } from './layout/routes'
import LoginPage from './pages/LoginPage'

// Découpage par route (LOT 4.8) : `recharts` (utilisé par le Tableau de bord et la
// fiche détaillée d'une position) pesait à lui seul une bonne part du bundle unique
// d'origine (~690 ko), chargé même sur les pages qui n'affichent aucun graphique
// (Portefeuille, Import, Réglages). `React.lazy` fait charger le code de chaque
// page à la demande (au moment de la navigation) plutôt que tout d'un bloc au
// premier chargement de l'application.
const AidePage = lazy(() => import('./pages/AidePage'))
const DashboardPage = lazy(() => import('./pages/DashboardPage'))
const DividendesPage = lazy(() => import('./pages/DividendesPage'))
const HoldingDetailPage = lazy(() => import('./pages/HoldingDetailPage'))
const ImportPage = lazy(() => import('./pages/ImportPage'))
const PortefeuillePage = lazy(() => import('./pages/PortefeuillePage'))
const RapportPage = lazy(() => import('./pages/RapportPage'))
const RepartitionPage = lazy(() => import('./pages/RepartitionPage'))
const ReglagesPage = lazy(() => import('./pages/ReglagesPage'))
const SimulateurPage = lazy(() => import('./pages/SimulateurPage'))

// Anciennes URL (avant le renommage backlog 2.K.2) : redirigées plutôt que
// supprimées, pour ne pas casser les marque-pages ou l'historique du navigateur.
function RedirectionTicker() {
  const { ticker } = useParams()
  return <Navigate to={`/patrimoine/${ticker}`} replace />
}

// Titre d'onglet dynamique (backlog 2.K.2) : `ROUTES` (`layout/routes.ts`) est la
// source unique pour l'URL, le libellé de navigation ET le titre d'onglet — évite
// que les trois divergent au fil des évolutions, comme le relevait l'audit UX.
function useTitreDocument() {
  const location = useLocation()
  useEffect(() => {
    const route = ROUTES.find((r) => matchPath({ path: r.path, end: true }, location.pathname))
    document.title = route ? `${route.titre} · Application Patrimoine` : 'Application Patrimoine'
  }, [location.pathname])
}

// Multi-utilisateur (Milestone 1) : tant que la connexion n'est pas vérifiée
// (`loading`), ou pas établie, seul l'écran de connexion est affiché — pas de route
// dédiée `/login`, l'état de connexion décide seul ce qui est rendu (plus simple
// qu'une redirection React Router pour un gate qui couvre TOUTE l'application).
function AppAuthentifiee() {
  const { user, loading } = useAuth()
  useTitreDocument()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-elevee">
        <p className="text-sm text-texte-attenue">Chargement...</p>
      </div>
    )
  }
  if (!user) return <LoginPage />

  return (
    <PreferencesAffichageProvider>
      <div className="flex h-screen overflow-hidden bg-surface-elevee">
        <Sidebar />

        <main className="flex-1 overflow-y-auto">
          <BarreControles />
          <div className="mx-auto max-w-6xl px-6 py-8">
            <Suspense fallback={<p className="text-sm text-texte-attenue">Chargement...</p>}>
              <Routes>
                <Route path="/" element={<DashboardPage />} />
                <Route path="/patrimoine" element={<PortefeuillePage />} />
                <Route path="/patrimoine/:ticker" element={<HoldingDetailPage />} />
                <Route path="/analyse" element={<RepartitionPage />} />
                <Route path="/objectifs" element={<SimulateurPage />} />
                <Route path="/dividendes" element={<DividendesPage />} />
                <Route path="/rapport" element={<RapportPage />} />
                <Route path="/import" element={<ImportPage />} />
                <Route path="/reglages" element={<ReglagesPage />} />
                <Route path="/aide" element={<AidePage />} />

                <Route path="/portefeuille" element={<Navigate to="/patrimoine" replace />} />
                <Route path="/portefeuille/:ticker" element={<RedirectionTicker />} />
                <Route path="/repartition" element={<Navigate to="/analyse" replace />} />
                <Route path="/simulateur" element={<Navigate to="/objectifs" replace />} />
              </Routes>
            </Suspense>
          </div>
        </main>
      </div>
    </PreferencesAffichageProvider>
  )
}

function App() {
  return (
    <AuthProvider>
      <AppAuthentifiee />
    </AuthProvider>
  )
}

export default App
