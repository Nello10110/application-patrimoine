import { Suspense, lazy, useEffect } from 'react'
import { Navigate, Route, Routes, matchPath, useLocation, useParams } from 'react-router-dom'
import BarreControles from './components/BarreControles'
import BottomNav from './components/BottomNav'
import FilDAriane from './components/FilDAriane'
import Sidebar from './components/Sidebar'
import WelcomeWizard from './components/onboarding/WelcomeWizard'
import { AuthProvider } from './contexts/AuthContext'
import { PreferencesAffichageProvider } from './contexts/PreferencesAffichageContext'
import { useAuth } from './hooks/useAuth'
import { PAGE_COMPONENTS } from './layout/pageComponents'
import { ROUTES } from './layout/routes'
import LoginPage from './pages/LoginPage'

// `/partage/:token` (backlog 2.Q.1) est une page publique, jamais dans `ROUTES`
// (réservé aux écrans de l'application authentifiée) : lazy-chargée séparément de
// `layout/pageComponents.ts`.
const PartagePublicPage = lazy(() => import('./pages/PartagePublicPage'))

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
  // Assistant de configuration initiale (welcome board, backlog nouveau) : réservé au
  // propriétaire (créateur du foyer, seul à voir les réglages qu'il couvre) — un
  // membre/invité, créé par lui via `POST /household-members`, n'a jamais besoin de
  // le voir. `onboarding_termine` (`UserParametre`, cf. `preferences_service.py`)
  // reste `False` tant que l'assistant n'a pas été terminé ou explicitement passé.
  if (user.role === 'proprietaire' && !user.onboarding_termine) return <WelcomeWizard />

  return (
    <PreferencesAffichageProvider>
      <div className="flex h-screen overflow-hidden bg-surface-elevee">
        <Sidebar />

        <main className="flex-1 overflow-y-auto">
          <BarreControles />
          <FilDAriane />
          {/* `pb-24` (backlog 2.K.4, < 768 px) : marge sous le contenu pour ne jamais
              le laisser passer sous `BottomNav`, fixe en bas de l'écran sur mobile
              (`h-16` + zone de sécurité iOS) — inutile dès 768 px, `BottomNav` est
              alors `md:hidden`. */}
          <div className="mx-auto max-w-6xl px-6 py-8 pb-24 md:pb-8">
            <Suspense fallback={<p className="text-sm text-texte-attenue">Chargement...</p>}>
              <Routes>
                {ROUTES.map((r) => {
                  const Composant = PAGE_COMPONENTS[r.path]
                  return Composant ? <Route key={r.path} path={r.path} element={<Composant />} /> : null
                })}

                <Route path="/portefeuille" element={<Navigate to="/patrimoine" replace />} />
                <Route path="/portefeuille/:ticker" element={<RedirectionTicker />} />
                {/* Feature d'objectifs de répartition annuelle retirée (25/08/2026) — ces
                    deux anciennes URL redirigent vers le Tableau de bord plutôt que de
                    disparaître, même logique que les autres redirections ci-dessus. */}
                <Route path="/repartition" element={<Navigate to="/" replace />} />
                <Route path="/analyse" element={<Navigate to="/" replace />} />
                <Route path="/simulateur" element={<Navigate to="/objectifs" replace />} />
              </Routes>
            </Suspense>
          </div>
        </main>

        <BottomNav />
      </div>
    </PreferencesAffichageProvider>
  )
}

// `/partage/:token` (backlog 2.Q.1) est une page PUBLIQUE, consultée par un
// visiteur anonyme sans compte : montée en dehors d'`AuthProvider`, jamais
// derrière l'écran de connexion — sinon un visiteur sans jeton n'y accéderait
// jamais. `Suspense` dédié : `AppAuthentifiee` (ci-dessus) n'est pas montée sur
// cette route, donc son propre `Suspense` ne la couvre pas.
function App() {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-texte-attenue">Chargement...</p>}>
      <Routes>
        <Route path="/partage/:token" element={<PartagePublicPage />} />
        <Route
          path="/*"
          element={
            <AuthProvider>
              <AppAuthentifiee />
            </AuthProvider>
          }
        />
      </Routes>
    </Suspense>
  )
}

export default App
