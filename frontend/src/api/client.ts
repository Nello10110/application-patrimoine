import type {
  AllocationTargetOut,
  AllocationTargetsSet,
  AnalysisResponse,
  CategoryCompositionResponse,
  ColumnMapping,
  PortfolioHistoryResponse,
  EtatRafraichissement,
  Holding,
  HoldingDetail,
  HoldingInput,
  HoldingPriceHistoryResponse,
  HoldingUpdateInput,
  ImportPreview,
  ImportResult,
  PerformanceSummary,
  ScheduledJob,
  TransactionImportResult,
} from './types'

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: options?.body instanceof FormData ? undefined : { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) {
    let detail = res.statusText
    try {
      const body = await res.json()
      detail = body.detail ?? JSON.stringify(body)
    } catch {
      // ignore
    }
    throw new Error(typeof detail === 'string' ? detail : JSON.stringify(detail))
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export const api = {
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

  // Transactions & performance
  importTransactions: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return request<TransactionImportResult>('/transactions/import', { method: 'POST', body: form })
  },
  getPerformance: () => request<PerformanceSummary>('/performance'),
  getPortfolioHistory: () => request<PortfolioHistoryResponse>('/performance/history'),

  // Réglages (tâches planifiées)
  listJobs: () => request<ScheduledJob[]>('/settings/jobs'),
  updateJob: (jobKey: string, payload: { enabled: boolean; intervalle_heures: number }) =>
    request<ScheduledJob>(`/settings/jobs/${jobKey}`, { method: 'PUT', body: JSON.stringify(payload) }),
  runJobNow: (jobKey: string) => request<ScheduledJob>(`/settings/jobs/${jobKey}/run-now`, { method: 'POST' }),
}
