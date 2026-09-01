import { expect, test } from '@playwright/test'
import { seedData } from './seed-data'

/** Vérifie directement les endpoints d'agrégation (jamais via l'interface) — les
 * mêmes contrôles effectués à la main lors de la mise en place de cette suite (cf.
 * `backend/scripts/seed_e2e.py` et la vérification manuelle documentée dans le
 * commit qui a introduit ce fichier) : patrimoine net, répartition géo/sectorielle,
 * budget, jonction patrimoine, récurrences. Un futur bug de calcul dans un service
 * backend fait échouer CE fichier, indépendamment de tout rendu d'écran — utile
 * pour distinguer un vrai bug de calcul d'une simple régression d'affichage. */
test.describe('Cohérence des agrégats (API directe)', () => {
  let headers: Record<string, string>

  test.beforeAll(async ({ request }) => {
    const { username, password } = seedData()
    const res = await request.post('/api/auth/login', { data: { username, password } })
    expect(res.ok()).toBeTruthy()
    const { token } = await res.json()
    headers = { Authorization: `Bearer ${token}` }
  })

  test('patrimoine net = actifs - passifs, cohérent avec le seed', async ({ request }) => {
    const { attendu } = seedData()
    const res = await request.get('/api/patrimoine/net', { headers })
    const net = await res.json()

    expect(net.patrimoine_financier).toBe(attendu.valeur_financiere)
    expect(net.patrimoine_net).toBe(attendu.patrimoine_net)
    expect(net.passifs_totaux).toBe(attendu.capital_restant_du_manuel)
    expect(net.actifs_totaux).toBe(
      attendu.valeur_financiere + attendu.valeur_appartement + attendu.valeur_livret,
    )
  })

  test('répartition géo/sectorielle du portefeuille financier', async ({ request }) => {
    const res = await request.get('/api/analysis', { headers })
    const analysis = await res.json()

    const totalGeo = analysis.geo.reduce((s: number, i: { valeur: number }) => s + i.valeur, 0)
    expect(Math.round(totalGeo)).toBe(4000)
    expect(analysis.sector).toEqual([
      { categorie: "Technologies de l'information", valeur: 4000, pourcentage_reel: 100 },
    ])
  })

  test('objectif "Fonds d\'urgence E2E" à 75% de progression', async ({ request }) => {
    const { attendu, objectif_id } = seedData()
    const res = await request.get(`/api/objectifs/${objectif_id}`, { headers })
    const objectif = await res.json()

    expect(objectif.valeur_actuelle).toBe(attendu.valeur_livret)
    expect(objectif.progression_pct).toBe(75)
  })

  test('budget : sorties/entrées et jonction patrimoine cohérentes sur 3 mois', async ({ request }) => {
    const fin = new Date().toISOString().slice(0, 10)
    const debut = new Date(Date.now() - 95 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

    const summaryRes = await request.get(`/api/budget/summary?date_debut=${debut}&date_fin=${fin}`, { headers })
    const summary = await summaryRes.json()
    expect(summary.entrees).toBe(7500)
    expect(summary.sorties).toBe(4455.9)
    expect(Math.round(summary.disponible * 10) / 10).toBe(3044.1)

    const jonctionRes = await request.get(
      `/api/budget/jonction-patrimoine?date_debut=${debut}&date_fin=${fin}`,
      { headers },
    )
    const jonction = await jonctionRes.json()
    expect(jonction.categorie_epargne_introuvable).toBe(false)
    expect(jonction.categorie_logement_introuvable).toBe(false)
    expect(jonction.versement_mensuel_epargne_declare).toBe(200)
  })

  test('3 récurrences détectées (loyer, épargne, courses)', async ({ request }) => {
    const res = await request.get('/api/budget/recurrences', { headers })
    const recurrences = await res.json()
    const libelles = recurrences.map((r: { libelle: string }) => r.libelle).sort()
    expect(libelles).toEqual(['Loyer appartement', 'Supermarche Leclerc', 'Virement vers Livret A'])
    for (const r of recurrences) expect(r.periodicite).toBe('mensuelle')
  })
})
