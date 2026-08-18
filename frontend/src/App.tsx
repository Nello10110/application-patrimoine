import { NavLink, Route, Routes } from 'react-router-dom'
import DashboardPage from './pages/DashboardPage'
import HoldingDetailPage from './pages/HoldingDetailPage'
import ImportPage from './pages/ImportPage'
import ObjectifsPage from './pages/ObjectifsPage'
import PortefeuillePage from './pages/PortefeuillePage'
import ReglagesPage from './pages/ReglagesPage'

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
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/portefeuille" element={<PortefeuillePage />} />
          <Route path="/portefeuille/:ticker" element={<HoldingDetailPage />} />
          <Route path="/objectifs" element={<ObjectifsPage />} />
          <Route path="/import" element={<ImportPage />} />
          <Route path="/reglages" element={<ReglagesPage />} />
        </Routes>
      </main>
    </div>
  )
}

export default App
