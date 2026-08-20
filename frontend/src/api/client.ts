import { clearToken, getToken, notifyUnauthorized } from '../auth/tokenStorage'
import type {
  AllocationTargetOut,
  AllocationTargetsSet,
  AnalysisResponse,
  AuthResponse,
  AuthUser,
  CategoryCompositionResponse,
  ColumnMapping,
  CoutGestionConsolide,
  DividendeMois,
  RapportPeriode,
  PortfolioHistoryResponse,
  EtatRafraichissement,
  Holding,
  HoldingDetail,
  HoldingInput,
  HoldingPriceHistoryResponse,
  HoldingUpdateInput,
  ImportPreview,
  ImportResult,
  Loan,
  LoanInput,
  LoanUpdateInput,
  PatrimoineNet,
  PerformanceSummary,
  Preferences,
  PreferencesUpdateResponse,
  RepartitionComptesResponse,
  ScheduledJob,
  TransactionImportResult,
  ZoneGeographiqueInfo,
} from './types'

// Messages génériques (LOT 6.8) : utilisés seulement quand l'API ne fournit aucun
// `detail` textuel exploitable — sinon on garde toujours celui du backend tel quel,
// il est déjà rédigé en français métier (cf. les `HTTPException` des routers).
const MESSAGE_ERREUR_RESEAU = 'Impossible de contacter le serveur. Vérifiez votre connexion et réessayez.'

const MESSAGES_PAR_STATUT: Record<number, string> = {
  404: 'La ressource demandée est introuvable.',
  413: 'Le fichier envoyé est trop volumineux.',
  429: 'Trop de requêtes envoyées en peu de temps. Merci de patienter avant de réessayer.',
  500: 'Une erreur interne est survenue côté serveur. Réessayez plus tard.',
}

function messageGenerique(status: number, statusText: string): string {
  return MESSAGES_PAR_STATUT[status] ?? `Une erreur inattendue est survenue (${status}${statusText ? ` ${statusText}` : ''}).`
}

// Routes publiques (Milestone 1, multi-utilisateur) : un 401 y est une erreur de
// connexion normale (mauvais mot de passe), affichée inline par `LoginPage` — pas
// une session expirée. Partout ailleurs, un 401 signifie que le jeton stocké n'est
// plus valide (expiré, ou compte déconnecté d'un autre onglet) : `notifyUnauthorized`
// prévient `AuthProvider`, qui efface l'état et renvoie vers `/login`.
function estRoutePublique(path: string): boolean {
  return path.startsWith('/auth/')
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  let res: Response
  const token = getToken()
  const headers: Record<string, string> = options?.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  try {
    res = await fetch(`/api${path}`, { headers, ...options })
  } catch {
    // `fetch` a échoué avant toute réponse (connexion au serveur perdue, serveur non
    // démarré...) : il n'y a aucun `detail` métier possible à afficher.
    throw new Error(MESSAGE_ERREUR_RESEAU)
  }
  if (!res.ok) {
    if (res.status === 401 && !estRoutePublique(path)) {
      clearToken()
      notifyUnauthorized()
    }
    let detail: string | null = null
    try {
      const body = await res.json()
      if (typeof body?.detail === 'string') detail = body.detail
    } catch {
      // Corps de réponse absent ou non-JSON : pas de `detail` à récupérer.
    }
    throw new Error(detail ?? messageGenerique(res.status, res.statusText))
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export const api = {
  // Authentification (Milestone 1, multi-utilisateur)
  login: (email: string, password: string) =>
    request<AuthResponse>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  register: (email: string, password: string) =>
    request<AuthResponse>('/auth/register', { method: 'POST', body: JSON.stringify({ email, password }) }),
  logout: () => request<void>('/auth/logout', { method: 'POST' }),
  getMe: () => request<AuthUser>('/auth/me'),

  // Portfolio
  listHoldings: () => request<Holding[]>('/portfolio/holdings'),
  createHolding: (payload: HoldingInput) =>
    request<Holding>('/portfolio/holdings', { method: 'POST', body: JSON.stringify(payload) }),
  updateHolding: (id: number, payload: HoldingUpdateInput) =>
    request<Holding>(`/portfolio/holdings/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deleteHolding: (id: number) => request<{ ok: boolean }>(`/portfolio/holdings/${id}`, { method: 'DELETE' }),
  getHoldingDetail: (ticker: string) => request<HoldingDetail>(`/portfolio/holdings/${encodeURIComponent(ticker)}/detail`),
  getHoldingPriceHistory: (ticker: string) =>
    request<HoldingPriceHistoryResponse>(`/portfolio/holdings/${encodeURIComponent(ticker)}/price-history`),

  importPreview: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return request<ImportPreview>('/portfolio/import/preview', { method: 'POST', body: form })
  },
  importConfirm: (mapping: ColumnMapping) =>
    request<ImportResult>('/portfolio/import/confirm', { method: 'POST', body: JSON.stringify(mapping) }),

  // Market data — rafraîchissement en tâche de fond (LOT 4B) : `refreshMarketData`
  // ne renvoie plus le cache complet mais l'état de démarrage (202), à sonder via
  // `getRefreshStatus` pendant que `en_cours` vaut `true`.
  refreshMarketData: () => request<EtatRafraichissement>('/market-data/refresh', { method: 'POST' }),
  getRefreshStatus: () => request<EtatRafraichissement>('/market-data/refresh/status'),

  // Targets
  getDefaultTargets: () =>
    request<{ geo: { categorie: string; pourcentage_cible: number }[]; sector: { categorie: string; pourcentage_cible: number }[] }>(
      '/targets/defaults',
    ),
  listTargetYears: () => request<number[]>('/targets/'),
  getTargets: (annee: number) => request<AllocationTargetOut[]>(`/targets/${annee}`),
  setTargets: (annee: number, payload: AllocationTargetsSet) =>
    request<AllocationTargetOut[]>(`/targets/${annee}`, { method: 'PUT', body: JSON.stringify(payload) }),

  // Analysis
  getAnalysis: (annee: number) => request<AnalysisResponse>(`/analysis/${annee}`),
  getCategoryComposition: (type: 'geo' | 'sector', categorie: string) =>
    request<CategoryCompositionResponse>(`/analysis/composition?type=${type}&categorie=${encodeURIComponent(categorie)}`),
  getRepartitionComptes: () => request<RepartitionComptesResponse>('/analysis/comptes'),
  getCoutGestionConsolide: () => request<CoutGestionConsolide>('/analysis/cout-gestion'),

  // Transactions & performance
  importTransactions: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return request<TransactionImportResult>('/transactions/import', { method: 'POST', body: form })
  },
  getPerformance: () => request<PerformanceSummary>('/performance'),
  getPortfolioHistory: () => request<PortfolioHistoryResponse>('/performance/history'),
  getDividendCalendar: () => request<DividendeMois[]>('/performance/dividendes'),
  getRapportPeriode: (dateDebut: string, dateFin: string) =>
    request<RapportPeriode>(`/performance/rapport?date_debut=${dateDebut}&date_fin=${dateFin}`),

  // Réglages (tâches planifiées)
  listJobs: () => request<ScheduledJob[]>('/settings/jobs'),
  updateJob: (jobKey: string, payload: { enabled: boolean; intervalle_heures: number }) =>
    request<ScheduledJob>(`/settings/jobs/${jobKey}`, { method: 'PUT', body: JSON.stringify(payload) }),
  runJobNow: (jobKey: string) => request<ScheduledJob>(`/settings/jobs/${jobKey}/run-now`, { method: 'POST' }),

  // Réglages (préférences applicatives, LOT 5B)
  getPreferences: () => request<Preferences>('/settings/preferences'),
  updatePreferences: (payload: Preferences) =>
    request<PreferencesUpdateResponse>('/settings/preferences', { method: 'PUT', body: JSON.stringify(payload) }),

  // Aide (FAQ)
  getZonesGeographiques: () => request<ZoneGeographiqueInfo[]>('/reference/zones-geographiques'),

  // Emprunts (roadmap Phase 1, patrimoine net)
  listLoans: () => request<Loan[]>('/loans'),
  createLoan: (payload: LoanInput) => request<Loan>('/loans', { method: 'POST', body: JSON.stringify(payload) }),
  updateLoan: (id: number, payload: LoanUpdateInput) =>
    request<Loan>(`/loans/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deleteLoan: (id: number) => request<{ ok: boolean }>(`/loans/${id}`, { method: 'DELETE' }),

  // Patrimoine net global (roadmap Phase 1) — aussi la base du Simulateur (roadmap
  // Phase 2/3, fusionné avec Outils) : la projection, le tableau de détail et le
  // calcul FIRE sont calculés côté client (`utils/interetsComposes.ts`), ce
  // patrimoine net actuel n'est plus utilisé que pour préremplir le capital de
  // départ.
  getPatrimoineNet: () => request<PatrimoineNet>('/patrimoine/net'),
}
