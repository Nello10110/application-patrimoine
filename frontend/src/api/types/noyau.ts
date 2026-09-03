export interface MarketData {
  ticker: string
  nom: string | null
  prix_actuel: number | null
  devise: string | null
  secteur: string | null
  pays: string | null
  region: string | null
  erreur: string | null
  derniere_maj: string
}

// Établissement financier (écran Comptes, backlog X.1) — liste gérée par
// l'utilisateur, réutilisée pour regrouper les comptes à l'écran.
export interface Etablissement {
  id: number
  nom: string
  created_at: string
  updated_at: string
}

// Compte structurel (compte courant, PEA, compte-titres, assurance-vie...) — écran
// Comptes (backlog X.1), remplace l'ancienne annotation texte libre `Holding.compte`.
// Un compte peut rattacher plusieurs `Holding` (ex. un compte-titres avec plusieurs
// lignes) ; un actif valorisé manuellement (immobilier, épargne...) a en pratique sa
// propre ligne de compte (1:1), simple convention, non imposée par le modèle.
export interface Compte {
  id: number
  nom: string
  etablissement: Etablissement | null
  created_at: string
  updated_at: string
}

// Un compte avec sa valeur agrégée (`GET /comptes/solde`) — `compte: null`
// représente le bucket « Sans compte » (lignes du foyer non rattachées), qui n'a pas
// d'existence en base.
export interface CompteAvecSolde {
  compte: Compte | null
  solde: number
  nombre_lignes: number
}

export interface Holding {
  id: number
  ticker: string
  nom: string | null
  quantite: number
  prix_revient_moyen: number | null
  // Compte structurel résolu (écran Comptes) — objet complet, jamais recalculé côté
  // client. `null` : ligne non rattachée à un compte.
  compte: Compte | null
  devise: string | null
  type_actif: string | null
  // "manuel" (saisie à la main ou relevé importé) | "reconstruit" (grand livre de
  // transactions) — cf. LOT 3.4, `models.ORIGINE_MANUEL`/`ORIGINE_RECONSTRUIT`.
  origine: string
  created_at: string
  updated_at: string
  market_data: MarketData | null
  rendement_depuis_achat_pct: number | null
  rendement_annualise_pct: number | null
  // Valeur de la ligne calculée côté serveur (prix de marché, à défaut prix de
  // revient, `null` si aucun des deux n'est connu) — cf. `analysis_service.value_holdings`
  // côté backend. Le frontend n'a plus à refaire ce calcul (LOT 6.7).
  valeur: number | null
  // Valorisation manuelle (immobilier/SCPI/assurance-vie/PER — roadmap Phase 1) :
  // montant ABSOLU en euros, prioritaire sur `prix * quantite` quand renseigné.
  // `date_valeur_estimee` n'est jamais saisie par l'utilisateur, posée côté serveur.
  valeur_estimee: number | null
  date_valeur_estimee: string | null
  // Taux annuel informatif (backlog § 2.M.1) : positif = intérêt attendu (épargne
  // réglementée/salariale), négatif = décote attendue (véhicule) — jamais appliqué
  // automatiquement à `valeur_estimee`, cf. `models.Holding.taux_pct` côté backend.
  taux_pct: number | null
  // Zone géographique déclarée pour un actif valorisé manuellement (backlog 2.P.1) —
  // cf. `models.Holding.zone_geo` côté backend.
  zone_geo: string | null
  // Versement mensuel récurrent déclaré (écran Épargne, backlog 2.S.1) — jamais
  // déduit automatiquement, additionné à `versement_mensuel_suggere` côté Simulateur.
  // Cf. `models.Holding.versement_mensuel` côté backend.
  versement_mensuel: number | null
  // Date d'acquisition du bien déclarée par l'utilisateur (retour utilisateur,
  // 26/08/2026) — distincte de `created_at` (date de saisie de la ligne) et de
  // `date_valeur_estimee` (dernière estimation). Cf. `models.Holding.date_acquisition`.
  date_acquisition: string | null
}

export interface HoldingInput {
  ticker: string
  nom?: string | null
  quantite: number
  prix_revient_moyen?: number | null
  // Référence à un compte déjà existant (vérifié appartenir à l'utilisateur côté
  // serveur), OU nom d'un compte à créer à la volée (`compte_nom`) — si les deux
  // sont fournis, `compte_id` prime.
  compte_id?: number | null
  compte_nom?: string | null
  devise?: string | null
  type_actif?: string | null
  valeur_estimee?: number | null
  taux_pct?: number | null
  zone_geo?: string | null
  versement_mensuel?: number | null
  // Format AAAA-MM-JJ, comme `ValorisationInput.date` — cf. `Holding.date_acquisition`.
  date_acquisition?: string | null
}

// Champs modifiables via `PATCH /api/portfolio/holdings/{id}` (cf. `HoldingUpdate`
// côté backend, `schemas.py`) : tous optionnels, seuls les champs présents sont
// écrasés (`exclude_unset`) — omettre un champ le laisse inchangé en base.
export interface HoldingUpdateInput {
  ticker?: string
  nom?: string | null
  quantite?: number
  prix_revient_moyen?: number | null
  compte_id?: number | null
  compte_nom?: string | null
  devise?: string | null
  type_actif?: string | null
  valeur_estimee?: number | null
  taux_pct?: number | null
  zone_geo?: string | null
  versement_mensuel?: number | null
  date_acquisition?: string | null
}

// Point d'historique daté par l'utilisateur (backlog 2.S.1) — cf. `schemas.
// ValorisationInput` côté backend. `date` au format AAAA-MM-JJ.
export interface ValorisationInput {
  valeur: number
  date: string
  // Part de la hausse (ou baisse, valeur négative = retrait) depuis le point
  // précédent qui vient d'un versement plutôt que d'une performance du contrat
  // (backlog § U.2, retour utilisateur 30/08/2026) — optionnel.
  versement?: number | null
}

export interface RepartitionParClasseItem {
  categorie: string
  valeur: number
}

export interface AllocationBreakdownItem {
  categorie: string
  valeur: number
  pourcentage_reel: number
}

export interface RepartitionItem {
  categorie: string
  poids: number
}

// Un point d'historique de valorisation (backlog 2.M.3) — jamais écrasé, contrairement
// à `Holding.valeur_estimee`/`date_valeur_estimee` (valeur courante seule).
export interface ValuationHistoryPoint {
  id: number
  date_valeur: string
  valeur: number
  versement: number | null
}
