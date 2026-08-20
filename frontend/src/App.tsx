import { Suspense, lazy } from 'react'
import { Link, NavLink, Route, Routes } from 'react-router-dom'
import { useTheme, type Theme } from './hooks/useTheme'

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

function App() {
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

export default App
