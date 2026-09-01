import { readFileSync } from 'node:fs'
import { SEED_OUTPUT_PATH } from './global-setup'

/** Résumé écrit par `backend/scripts/seed_e2e.py` (identifiants créés, identifiants
 * de connexion, agrégats attendus déjà vérifiés à la main lors de la mise en place
 * de cette suite — cf. commentaire du script). Lu paresseusement (pas au chargement
 * du module) : `global-setup.ts` n'a pas encore écrit le fichier au moment où les
 * fichiers de spec sont collectés par Playwright. */
export interface SeedData {
  username: string
  password: string
  detenteurs: { alice_id: number; bob_id: number }
  holdings: {
    aapl: { id: number; ticker: string }
    fund: { id: number; ticker: string }
    appartement: { id: number; ticker: string }
    livret: { id: number; ticker: string }
  }
  loan_id: number
  objectif_id: number
  attendu: {
    valeur_financiere: number
    patrimoine_net: number
    capital_restant_du_manuel: number
    valeur_appartement: number
    valeur_livret: number
  }
}

let cache: SeedData | null = null

export function seedData(): SeedData {
  if (!cache) {
    cache = JSON.parse(readFileSync(SEED_OUTPUT_PATH, 'utf-8')) as SeedData
  }
  return cache
}
