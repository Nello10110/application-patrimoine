import { Suspense, lazy, useEffect } from 'react'
import { Navigate, Route, Routes, matchPath, useLocation, useParams } from 'react-router-dom'
import BarreControles from './components/BarreControles'
import BottomNav from './components/BottomNav'
import EnTeteMobile from './components/EnTeteMobile'
import { SkeletonTexte } from './components/Skeleton'
import { useAppliquerTheme } from './hooks/useTheme'
import Sidebar from './components/Sidebar'
import RattrapageComptes from './components/onboarding/RattrapageComptes'
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
        <SkeletonTexte lignes={1} />
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
  // Écran de rattrapage bloquant (revue du 03/09/2026, compte obligatoire sur une
  // ligne financière) : `proprietaire` ET `membre` peuvent tous deux créer des
  // lignes sans compte (`_peut_ecrire` côté backend), donc tous deux doivent voir
  // ce gate — contrairement à l'onboarding ci-dessus, réservé au propriétaire. Un
  // `invite`, lecture seule, ne peut rien y corriger : jamais bloqué par un état
  // qu'il ne peut pas changer lui-même.
  if (user.role !== 'invite' && user.holdings_sans_compte > 0) return <RattrapageComptes />

  return (
    <PreferencesAffichageProvider>
      {/* Coque de la refonte « liquid glass » (étape 3) : la racine ne défile jamais
          et laisse voir le fond à halos porté par `<body>` (plus de `bg-surface-elevee`
          opaque par-dessus). Les panneaux flottent dessus, séparés de 14 px. */}
      <div className="flex h-screen gap-[14px] overflow-hidden p-[14px]">
        <Sidebar />

        {/* `min-w-0` : sans lui, un tableau large (Patrimoine) force la colonne à
            s'élargir au lieu de défiler à l'intérieur — le défaut `min-width:auto`
            d'un enfant flex. */}
        <main className="flex min-w-0 flex-1 flex-col gap-[14px]">
          {/* Deux en-têtes exclusifs, jamais montés en même temps : la barre de
              contrôles desktop est `hidden md:flex`, `EnTeteMobile` est `md:hidden`.
              Même partage que `Sidebar`/`BottomNav` — la maquette mobile ne réduit pas
              la barre desktop, elle la remplace. */}
          <BarreControles />
          <EnTeteMobile />
          {/* Seule cette zone défile (`min-h-0` : sans lui, un enfant flex refuse de
              devenir plus petit que son contenu, et c'est la page entière qui
              défilerait — ce que la coque interdit). La barre de contrôles reste donc
              visible sans `position: sticky`.
              `pb-24` (backlog 2.K.4, < 768 px) : marge sous le contenu pour ne jamais
              le laisser passer sous `BottomNav`, fixe en bas de l'écran sur mobile. */}
          <div className="min-h-0 flex-1 overflow-y-auto pb-24 md:pb-0">
            <div className="mx-auto max-w-6xl">
            <Suspense fallback={<SkeletonTexte />}>
              <Routes>
                {ROUTES.map((r) => {
                  const Composant = PAGE_COMPONENTS[r.path]
                  return Composant ? <Route key={r.path} path={r.path} element={<Composant />} /> : null
                })}

                <Route path="/portefeuille" element={<Navigate to="/patrimoine" replace />} />
                <Route path="/portefeuille/:ticker" element={<RedirectionTicker />} />
                {/* Feature d'objectifs de répartition annuelle retirée (25/08/2026) —
                    cette ancienne URL redirige vers le Tableau de bord plutôt que de
                    disparaître, même logique que les autres redirections ci-dessus.
                    `/analyse`, qui redirigeait ici pour la même raison, est redevenue
                    un écran à part entière le 07/09/2026. */}
                <Route path="/repartition" element={<Navigate to="/" replace />} />
                {/* L'écran Dividendes est devenu l'onglet Revenus d'`Analyse`
                    (07/09/2026) : l'ancienne URL y mène directement. */}
                <Route path="/dividendes" element={<Navigate to="/analyse?onglet=revenus" replace />} />
                <Route path="/simulateur" element={<Navigate to="/objectifs" replace />} />
              </Routes>
            </Suspense>
            </div>
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
  // Applique le thème stocké dès le montage. Sans cet appel, la classe `dark`
  // n'était posée qu'à l'ouverture du menu Compte, seul endroit où vivait
  // `useTheme` — cf. sa docstring. Placé sur `App` et non `AppAuthentifiee` pour
  // couvrir aussi l'écran de connexion et les liens de partage public.
  useAppliquerTheme()

  return (
    <Suspense fallback={<div className="p-6"><SkeletonTexte /></div>}>
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
