import { afterEach, describe, expect, it, vi } from 'vitest'
import { api } from './client'

// `api.*` passe systématiquement par `request()` : on teste directement via une
// méthode existante (`listHoldings`) plutôt que de dupliquer `request` en dur ici.
// `fetch` est intégralement mocké (aucun appel réseau réel, cf. mission).
function mockFetchOnce(reponse: Partial<Response> & { ok: boolean; status: number; statusText?: string }) {
  const fetchMock = vi.fn().mockResolvedValue({
    statusText: '',
    json: async () => ({}),
    ...reponse,
  } as Response)
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('api client — messages d\'erreur (LOT 6.8)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('traduit un échec réseau (fetch qui rejette) en message compréhensible', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new TypeError('Failed to fetch')),
    )

    await expect(api.listHoldings()).rejects.toThrow('Impossible de contacter le serveur. Vérifiez votre connexion et réessayez.')
  })

  it('conserve tel quel le detail métier fourni par l\'API', async () => {
    mockFetchOnce({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      json: async () => ({ detail: 'La quantité doit être strictement positive' }),
    })

    await expect(api.listHoldings()).rejects.toThrow('La quantité doit être strictement positive')
  })

  it('traduit un 404 sans detail en message générique', async () => {
    mockFetchOnce({ ok: false, status: 404, statusText: 'Not Found', json: async () => ({}) })

    await expect(api.listHoldings()).rejects.toThrow('La ressource demandée est introuvable.')
  })

  it('traduit un 500 sans detail en message générique', async () => {
    mockFetchOnce({ ok: false, status: 500, statusText: 'Internal Server Error', json: async () => ({}) })

    await expect(api.listHoldings()).rejects.toThrow('Une erreur interne est survenue côté serveur. Réessayez plus tard.')
  })

  it('traduit un 413 (fichier trop volumineux) sans detail en message générique', async () => {
    mockFetchOnce({ ok: false, status: 413, statusText: 'Payload Too Large', json: async () => ({}) })

    await expect(api.listHoldings()).rejects.toThrow('Le fichier envoyé est trop volumineux.')
  })

  it('traduit un 429 sans detail en message générique', async () => {
    mockFetchOnce({ ok: false, status: 429, statusText: 'Too Many Requests', json: async () => ({}) })

    await expect(api.listHoldings()).rejects.toThrow('Trop de requêtes envoyées en peu de temps. Merci de patienter avant de réessayer.')
  })

  it('retombe sur un message générique avec le code HTTP pour un statut non couvert sans detail', async () => {
    mockFetchOnce({ ok: false, status: 418, statusText: "I'm a teapot", json: async () => ({}) })

    await expect(api.listHoldings()).rejects.toThrow(/418/)
  })

  it('gère un corps de réponse absent ou non-JSON sans lever une autre erreur', async () => {
    mockFetchOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: async () => {
        throw new SyntaxError('Unexpected end of JSON input')
      },
    })

    await expect(api.listHoldings()).rejects.toThrow('Une erreur interne est survenue côté serveur. Réessayez plus tard.')
  })

  it('renvoie les données JSON sur une réponse réussie', async () => {
    mockFetchOnce({ ok: true, status: 200, json: async () => [{ id: 1 }] })

    await expect(api.listHoldings()).resolves.toEqual([{ id: 1 }])
  })
})
