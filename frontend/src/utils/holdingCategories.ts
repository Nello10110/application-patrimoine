import type { Holding } from '../api/types'
import { parseDateApi } from './format'

export type Categorie = 'TOUS' | 'STOCK' | 'FUND' | 'BOND' | 'PRIVATE_FUND' | 'CRYPTO' | 'PATRIMOINE' | 'AUTRES'

export const CATEGORY_TABS: { key: Categorie; label: string }[] = [
  { key: 'TOUS', label: 'Tous' },
  { key: 'STOCK', label: 'Actions' },
  { key: 'FUND', label: 'ETF' },
  { key: 'BOND', label: 'Obligations' },
  { key: 'PRIVATE_FUND', label: 'Private Equity' },
  { key: 'CRYPTO', label: 'Crypto' },
  { key: 'PATRIMOINE', label: 'Immobilier & Épargne' },
  { key: 'AUTRES', label: 'Autres' },
]

// Immobilier/SCPI/assurance-vie/PER/autre actif (roadmap Phase 1 et 2, patrimoine
// net) : aucune cotation automatique, valorisés via `Holding.valeur_estimee`. Cf.
// `models.TYPES_ACTIF_PATRIMOINE_MANUEL` côté backend.
const TYPES_PATRIMOINE = new Set(['REAL_ESTATE', 'SCPI', 'LIFE_INSURANCE', 'PENSION', 'OTHER_ASSET'])

// Valeurs acceptées par le backend (cf. `Holding.type_actif` dans `models.py`) : une
// ligne saisie à la main sans type explicite finit en "Autres" côté filtrage et
// échappe au look-through par catégorie — d'où l'option "Non précisé" plutôt qu'un
// type par défaut implicite.
export const TYPE_ACTIF_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Non précisé' },
  { value: 'STOCK', label: 'Action' },
  { value: 'FUND', label: 'ETF / Fonds' },
  { value: 'CRYPTO', label: 'Crypto' },
  { value: 'BOND', label: 'Obligation' },
  { value: 'PRIVATE_FUND', label: 'Private Equity' },
  { value: 'REAL_ESTATE', label: 'Immobilier' },
  { value: 'SCPI', label: 'SCPI' },
  { value: 'LIFE_INSURANCE', label: 'Assurance-vie' },
  { value: 'PENSION', label: 'PER / Épargne retraite' },
  { value: 'OTHER_ASSET', label: 'Autre actif' },
]

export function categorieDe(h: Holding): Categorie {
  if (h.type_actif && TYPES_PATRIMOINE.has(h.type_actif)) return 'PATRIMOINE'
  if (
    h.type_actif === 'STOCK' ||
    h.type_actif === 'FUND' ||
    h.type_actif === 'BOND' ||
    h.type_actif === 'PRIVATE_FUND' ||
    h.type_actif === 'CRYPTO'
  ) {
    return h.type_actif
  }
  return 'AUTRES'
}

// Filtre par compte (LOT 5.1), combiné au filtre de catégorie ci-dessus. Le compte
// est une simple annotation manuelle par ligne (`Holding.compte`, cf. le formulaire
// d'ajout et l'édition en ligne) : ce filtre ne fait que répartir la valeur AFFICHÉE,
// il ne calcule aucune rentabilité par compte (impossible depuis le grand livre
// importé, cf. `GET /api/analysis/comptes`).
export const FILTRE_TOUS_COMPTES = 'TOUS'
export const FILTRE_SANS_COMPTE = 'SANS_COMPTE'

export function comptesDisponibles(holdings: Holding[]): string[] {
  const comptes = new Set(holdings.map((h) => h.compte).filter((c): c is string => Boolean(c)))
  return Array.from(comptes).sort((a, b) => a.localeCompare(b, 'fr'))
}

export function correspondAuFiltreCompte(h: Holding, filtreCompte: string): boolean {
  if (filtreCompte === FILTRE_TOUS_COMPTES) return true
  if (filtreCompte === FILTRE_SANS_COMPTE) return h.compte === null
  return h.compte === filtreCompte
}

// Cours (`market_data.derniere_maj`) le plus ancien parmi les positions cotées
// (LOT 5.11) : reflète la fraîcheur globale de l'affichage, indépendamment du
// filtre de catégorie actif.
export function coursLePlusAncien(holdings: Holding[]): string | null {
  const dates = holdings.map((h) => h.market_data?.derniere_maj).filter((d): d is string => Boolean(d))
  if (dates.length === 0) return null
  return dates.reduce((plusAncienne, courante) =>
    parseDateApi(courante).getTime() < parseDateApi(plusAncienne).getTime() ? courante : plusAncienne,
  )
}

export const SEUIL_PEREMPTION_HEURES = 48
