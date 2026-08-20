import { Suspense, lazy } from 'react'
import { Link, NavLink, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { useAuth } from './hooks/useAuth'
import { useTheme, type Theme } from './hooks/useTheme'
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

const navItems = [
  { to: '/', label: 'Tableau de bord', end: true },
  { to: '/portefeuille', label: 'Portefeuille' },
  { to: '/repartition', label: 'Répartition' },
  { to: '/simulateur', label: 'Simulateur' },
  { to: '/dividendes', label: 'Dividendes' },
  { to: '/rapport', label: 'Rapport' },
  { to: '/import', label: 'Import' },
  { to: '/reglages', label: 'Réglages' },
  { to: '/aide', label: 'Aide' },
]

// Bascule discrète du thème (LOT 5.12) : un clic fait cycler clair → sombre →
// système → clair, plutôt que trois boutons séparés — cohérent avec le reste de
// l'en-tête (peu d'espace, une seule action à la fois).
const THEME_SUIVANT: Record<Theme, Theme> = { clair: 'sombre', sombre: 'systeme', systeme: 'clair' }
const THEME_ICONES: Record<Theme, string> = { clair: '☀️', sombre: '🌙', systeme: '🖥️' }
const THEME_LABELS: Record<Theme, string> = { clair: 'Clair', sombre: 'Sombre', systeme: 'Système' }

function BasculeTheme() {
  const { theme, setTheme } = useTheme()
  return (
    <button
      type="button"
      onClick={() => setTheme(THEME_SUIVANT[theme])}
      title={`Thème : ${THEME_LABELS[theme]} (cliquer pour changer)`}
      aria-label={`Thème : ${THEME_LABELS[theme]}. Cliquer pour changer.`}
      className="ml-auto flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700"
    >
      <span aria-hidden="true">{THEME_ICONES[theme]}</span>
      <span className="hidden sm:inline">{THEME_LABELS[theme]}</span>
    </button>
  )
}

// Avatar généré (pas d'upload d'image, initiale + couleur dérivée du nom
// d'utilisateur — déterministe, donc stable d'une connexion à l'autre). Cliquer
// dessus déconnecte directement : pas de menu déroulant, c'est la seule action
// proposée ici.
function couleurAvatar(nom: string): string {
  let hash = 0
  for (const c of nom) hash = (hash * 31 + c.charCodeAt(0)) % 360
  return `hsl(${hash}, 55%, 42%)`
}

function AvatarUtilisateur() {
  const { user, logout } = useAuth()
  if (!user) return null
  const initiale = user.username.trim().charAt(0).toUpperCase() || '?'
  return (
    <button
      type="button"
      onClick={logout}
      title="Se déconnecter"
      className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
    >
      <span
        aria-hidden="true"
        className="flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold text-white"
        style={{ backgroundColor: couleurAvatar(user.username) }}
      >
        {initiale}
      </span>
      <span className="hidden sm:inline">{user.username}</span>
    </button>
  )
}

// Multi-utilisateur (Milestone 1) : tant que la connexion n'est pas vérifiée
// (`loading`), ou pas établie, seul l'écran de connexion est affiché — pas de route
// dédiée `/login`, l'état de connexion décide seul ce qui est rendu (plus simple
// qu'une redirection React Router pour un gate qui couvre TOUTE l'application).
function AppAuthentifiee() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-900">
        <p className="text-sm text-slate-500 dark:text-slate-400">Chargement...</p>
      </div>
    )
  }
  if (!user) return <LoginPage />

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <header className="border-b border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-6 py-4">
          <Link to="/" className="text-lg font-semibold text-slate-900 hover:text-slate-700 dark:text-slate-100 dark:hover:text-slate-300">
            Application Patrimoine
          </Link>
          <nav className="flex gap-1">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                      : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          <BasculeTheme />
          <AvatarUtilisateur />
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        <Suspense fallback={<p className="text-sm text-slate-500 dark:text-slate-400">Chargement...</p>}>
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/portefeuille" element={<PortefeuillePage />} />
            <Route path="/portefeuille/:ticker" element={<HoldingDetailPage />} />
            <Route path="/repartition" element={<RepartitionPage />} />
            <Route path="/simulateur" element={<SimulateurPage />} />
            <Route path="/dividendes" element={<DividendesPage />} />
            <Route path="/rapport" element={<RapportPage />} />
            <Route path="/import" element={<ImportPage />} />
            <Route path="/reglages" element={<ReglagesPage />} />
            <Route path="/aide" element={<AidePage />} />
          </Routes>
        </Suspense>
      </main>
    </div>
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
