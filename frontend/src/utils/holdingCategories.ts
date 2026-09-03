import type { Compte, Holding } from '../api/types'
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

// Immobilier/SCPI/assurance-vie/PER/autre actif/taxonomie élargie (roadmap Phase 1
// et 2, Lot 5 § M.1 — patrimoine net) : aucune cotation automatique, valorisés via
// `Holding.valeur_estimee`. Cf. `models.TYPES_ACTIF_PATRIMOINE_MANUEL` côté backend.
// Exporté (backlog 2.P.1) : sert aussi à n'afficher le champ Zone géographique que
// pour ces types dans le formulaire d'ajout manuel.
export const TYPES_PATRIMOINE = new Set([
  'REAL_ESTATE',
  'SCPI',
  'LIFE_INSURANCE',
  'PENSION',
  'OTHER_ASSET',
  'CASH_ACCOUNT',
  'REGULATED_SAVINGS',
  'EMPLOYEE_SAVINGS',
  'VEHICLE',
])

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
  { value: 'CASH_ACCOUNT', label: 'Compte courant' },
  { value: 'REGULATED_SAVINGS', label: 'Épargne réglementée (Livret A, LDDS...)' },
  { value: 'EMPLOYEE_SAVINGS', label: 'Épargne salariale (PEE, PERCO...)' },
  { value: 'VEHICLE', label: 'Véhicule' },
  { value: 'OTHER_ASSET', label: 'Autre actif' },
]

// Sous-ensemble de `TYPES_PATRIMOINE` dispensé de compte (revue du 03/09/2026,
// demande directe de l'utilisateur : « les seules lignes sans établissement
// doivent être l'immobilier et ce genre de choses ») — miroir de
// `models.TYPES_ACTIF_SANS_ETABLISSEMENT` côté backend, TOUJOURS tenu à jour avec
// lui. Un `type_actif` non précisé (`''`) n'est PAS exempté : le sélecteur de
// compte doit garder l'option « — Aucun — » retirée par défaut.
export const TYPES_ACTIF_SANS_ETABLISSEMENT = new Set(['REAL_ESTATE', 'VEHICLE', 'OTHER_ASSET'])

// Types pour lesquels `taux_pct` a un sens (backlog § 2.M.1) : intérêt attendu pour
// l'épargne, décote attendue pour un véhicule — affiche le libellé et le signe
// suggéré adaptés au type sélectionné plutôt qu'un champ générique muet.
export const TYPES_AVEC_TAUX = new Set(['REGULATED_SAVINGS', 'EMPLOYEE_SAVINGS', 'VEHICLE'])

// Textes d'aide contextuelle (bulle `InfoBulle`, retour utilisateur 30/08/2026) —
// centralisés ici pour rester identiques entre le formulaire d'ajout
// (`PortefeuillePage.tsx`) et l'édition en ligne (`PositionsTable.tsx`, mobile et
// desktop), plutôt que dupliqués à 3 endroits.
export const TEXTE_PRIX_REVIENT =
  "Montant investi à l'achat. Pour une action/ETF importé, calculé automatiquement à partir de vos transactions ; pour une ligne saisie à la main (immobilier, assurance-vie...), à renseigner vous-même. Reste une base fixe, utilisée pour calculer votre gain ou perte."
export const TEXTE_VALEUR_ESTIMEE =
  "Valeur actuelle du bien, à mettre à jour vous-même (estimation d'agence, avis de valeur...) — concerne uniquement les lignes valorisées manuellement (immobilier, SCPI, assurance-vie...). Remplace alors le calcul prix × quantité. Chaque changement est conservé dans l'historique, jamais écrasé silencieusement."

// Sous-ensemble de TYPES_PATRIMOINE couvert par l'écran Épargne (backlog 2.S.1) —
// miroir de `models.TYPES_EPARGNE` côté backend. Le Véhicule en reste exclu (décote
// plutôt qu'épargne, futur rapprochement avec l'immobilier — décision du 25/08/2026).
export const TYPES_EPARGNE = new Set(['CASH_ACCOUNT', 'REGULATED_SAVINGS', 'EMPLOYEE_SAVINGS', 'LIFE_INSURANCE', 'PENSION'])

// Les 6 zones de `backend/app/services/reference_indices.py` (jamais une granularité
// par pays) — utilisées telles quelles comme valeur de `Holding.zone_geo` (backlog
// 2.P.1). Dupliquées ici en constantes de chaînes plutôt qu'exposées par une route
// dédiée : la liste est stable et déjà répétée côté backend dans plusieurs modules.
export const ZONES_GEO = [
  'Amérique du Nord',
  'Europe',
  'Japon',
  'Asie-Pacifique (hors Japon)',
  'Marchés émergents',
  'Autres zones',
]

export function libelleTaux(typeActif: string): string {
  return typeActif === 'VEHICLE' ? 'Décote annuelle (%)' : "Taux d'intérêt annuel (%)"
}

/** Valeur projetée dans 1 an à partir de `valeur_estimee` et `taux_pct` — purement
 * indicatif côté client, jamais appliqué automatiquement à `valeur_estimee` (cf.
 * `models.Holding.taux_pct`, backend). `null` si l'un des deux n'est pas renseigné. */
export function valeurProjeteeUnAn(valeurEstimee: number | null, tauxPct: number | null): number | null {
  if (valeurEstimee === null || tauxPct === null) return null
  return valeurEstimee * (1 + tauxPct / 100)
}

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

// Filtre par compte, combiné au filtre de catégorie ci-dessus — écran Comptes
// structurel (backlog X.1) : `Holding.compte` est désormais une vraie relation
// (`Compte | null`, plus un texte libre). Ce filtre local à Portefeuille ne dérive
// que les comptes réellement présents dans les lignes déjà chargées (contrairement
// à l'écran Comptes dédié, qui liste TOUS les comptes du foyer, même vides).
export const FILTRE_TOUS_COMPTES = 'TOUS'
export const FILTRE_SANS_COMPTE = 'SANS_COMPTE'

export function comptesDisponibles(holdings: Holding[]): Compte[] {
  const parId = new Map<number, Compte>()
  for (const h of holdings) {
    if (h.compte) parId.set(h.compte.id, h.compte)
  }
  return Array.from(parId.values()).sort((a, b) => a.nom.localeCompare(b.nom, 'fr'))
}

export function correspondAuFiltreCompte(h: Holding, filtreCompte: string): boolean {
  if (filtreCompte === FILTRE_TOUS_COMPTES) return true
  if (filtreCompte === FILTRE_SANS_COMPTE) return h.compte === null
  return h.compte !== null && String(h.compte.id) === filtreCompte
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
