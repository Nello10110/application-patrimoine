import { Suspense, lazy } from 'react'
import { NavLink, Route, Routes } from 'react-router-dom'

// Découpage par route (LOT 4.8) : `recharts` (utilisé par le Tableau de bord et la
// fiche détaillée d'une position) pesait à lui seul une bonne part du bundle unique
// d'origine (~690 ko), chargé même sur les pages qui n'affichent aucun graphique
// (Portefeuille, Objectifs, Import, Réglages). `React.lazy` fait charger le code de
// chaque page à la demande (au moment de la navigation) plutôt que tout d'un bloc
// au premier chargement de l'application.
const DashboardPage = lazy(() => import('./pages/DashboardPage'))
const HoldingDetailPage = lazy(() => import('./pages/HoldingDetailPage'))
const ImportPage = lazy(() => import('./pages/ImportPage'))
const ObjectifsPage = lazy(() => import('./pages/ObjectifsPage'))
const PortefeuillePage = lazy(() => import('./pages/PortefeuillePage'))
const ReglagesPage = lazy(() => import('./pages/ReglagesPage'))

const navItems = [
  { to: '/', label: 'Tableau de bord', end: true },
  { to: '/portefeuille', label: 'Portefeuille' },
  { to: '/objectifs', label: 'Objectifs' },
  { to: '/import', label: 'Import' },
  { to: '/reglages', label: 'Réglages' },
]

function App() {
  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-6 py-4">
          <h1 className="text-lg font-semibold text-slate-900">Outil Bourse</h1>
          <nav className="flex gap-1">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    isActive ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        <Suspense fallback={<p className="text-sm text-slate-500">Chargement...</p>}>
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/portefeuille" element={<PortefeuillePage />} />
            <Route path="/portefeuille/:ticker" element={<HoldingDetailPage />} />
            <Route path="/objectifs" element={<ObjectifsPage />} />
            <Route path="/import" element={<ImportPage />} />
            <Route path="/reglages" element={<ReglagesPage />} />
          </Routes>
        </Suspense>
      </main>
    </div>
  )
}

export default App
