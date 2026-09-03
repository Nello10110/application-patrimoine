import type { QuotiteDetenteurItem } from './detenteurs'
import type { Compte, RepartitionItem, RepartitionParClasseItem } from './noyau'

// Emprunt (roadmap Phase 1, patrimoine net) — premier passif de l'application.
// `capital_restant_du` est toujours calculé côté serveur (`loan_service.py`), jamais
// recalculé côté frontend.
export interface Loan {
  id: number
  libelle: string
  capital_initial: number
  taux_annuel_pct: number
  mensualite: number
  date_debut: string
  duree_mois: number
  capital_restant_du_manuel: number | null
  derniere_maj_manuelle: string | null
  capital_restant_du: number
  // Rattachement à un actif (backlog 2.M.2).
  holding_id: number | null
  created_at: string
  updated_at: string
}

export interface LoanInput {
  libelle: string
  capital_initial: number
  taux_annuel_pct: number
  mensualite: number
  date_debut: string
  duree_mois: number
  capital_restant_du_manuel?: number | null
}

export interface LoanUpdateInput {
  libelle?: string
  capital_initial?: number
  taux_annuel_pct?: number
  mensualite?: number
  date_debut?: string
  duree_mois?: number
  capital_restant_du_manuel?: number | null
  holding_id?: number | null
}

// Patrimoine net global (roadmap Phase 1) — distinct de `AnalysisResponse.valeur_totale`
// (scopé au seul portefeuille financier) : couvre en plus l'immobilier/SCPI/
// assurance-vie/PER, et retranche les emprunts.
export interface PatrimoineNet {
  actifs_totaux: number
  passifs_totaux: number
  patrimoine_net: number
  patrimoine_financier: number
  repartition_par_classe: RepartitionParClasseItem[]
  // Lentille "financier" (feature Net/Brut/Financier sur toute la page Synthèse) :
  // même répartition, restreinte au seul portefeuille financier.
  repartition_par_classe_financiere: RepartitionParClasseItem[]
  // Lentille "net" : même répartition, chaque ligne nettée de SON emprunt rattaché
  // (pas seulement le grand total) — peut contenir des valeurs négatives (équité
  // négative sur une ligne, ou un bucket "Dettes non rattachées"), jamais masquées.
  repartition_par_classe_nette: RepartitionParClasseItem[]
}

// Historique combiné financier + immobilier/épargne − emprunts (feature Net/Brut/
// Financier sur toute la page Synthèse) — distinct de `PortfolioHistoryPoint`
// (financier seul). Cf. `services/patrimoine_history_service.py` pour les deux
// limites assumées : données manuelles clairsemées, ratio flou pour le scoping
// détenteur de la poche financière.
export interface PatrimoineHistoryPoint {
  date: string
  valeur_financiere: number
  valeur_manuelle: number
  actifs_totaux: number
  passifs_totaux: number
  patrimoine_net: number
  patrimoine_financier: number
  // Mode étagé Investi/Gains hors lentille Financier (backlog § U.4, 30/08/2026) —
  // mêmes noms que `PortfolioHistoryPoint`, même formule de décomposition côté
  // composant. La part manuelle de `valeur_investie` ne progresse qu'aux points où
  // un versement a été explicitement déclaré (`Holding`/`HoldingValuationHistory.
  // versement`, § U.2) ; `valeur_realisee_cumulee` reste exclusivement financière.
  valeur_investie: number
  // Nettée de `passifs_totaux` (retour utilisateur 31/08/2026) : `valeur_investie`
  // ci-dessus reste BRUTE, jamais réduite d'un emprunt — c'est CE champ qu'utilise le
  // mode étagé en lentille Net, jamais `valeur_investie` (qui sous-compterait les
  // gains d'un bien financé à crédit, la dette étant alors soustraite deux fois).
  valeur_investie_nette: number
  valeur_realisee_cumulee: number
}

export interface PatrimoineHistoryResponse {
  points: PatrimoineHistoryPoint[]
}

// Exposition consolidée tous actifs (backlog 2.P.1) — une seule répartition géo/classe
// financier ET immobilier/épargne confondus, distincte de `AnalysisResponse` (portefeuille
// financier seul) et de `PatrimoineNet` (pas de vue géo/concentration).
// Champs sans suffixe = valeur BRUTE ; `_nette` = chaque ligne nettée de son emprunt
// rattaché (backlog 2.S.2) — même principe que `repartition_par_classe`/`_nette` du
// patrimoine net. `ExpositionConsolideeCard` choisit selon la lentille active.
export interface ExpositionConsolidee {
  valeur_totale: number
  repartition_geo: RepartitionParClasseItem[]
  repartition_classe: RepartitionParClasseItem[]
  plus_grosse_ligne_ticker: string | null
  plus_grosse_ligne_pct: number | null
  top5_lignes_pct: number | null
  premiere_zone_geo: string | null
  premiere_zone_geo_pct: number | null
  part_estimee_manuelle_pct: number
  valeur_totale_nette: number
  repartition_geo_nette: RepartitionParClasseItem[]
  repartition_classe_nette: RepartitionParClasseItem[]
  plus_grosse_ligne_ticker_nette: string | null
  plus_grosse_ligne_pct_nette: number | null
  top5_lignes_pct_nette: number | null
  premiere_zone_geo_nette: string | null
  premiere_zone_geo_pct_nette: number | null
  part_estimee_manuelle_pct_nette: number
}

export interface FundTopHoldingItem {
  symbol: string
  nom: string | null
  poids: number
  pays: string | null
  secteur: string | null
}

export interface HoldingDetail {
  ticker: string
  nom: string | null
  type_actif: string | null
  // Compte structurel rattaché (écran Comptes, backlog X.1) — même relation que
  // `Holding.compte`, `null` si la ligne n'est rattachée à aucun compte.
  compte: Compte | null
  quantite: number
  prix_revient_moyen: number | null
  prix_actuel: number | null
  valeur: number
  devise: string | null
  secteur: string | null
  pays: string | null
  rendement_depuis_achat_pct: number | null
  rendement_annualise_pct: number | null
  emetteur: string | null
  resume: string | null
  frais_gestion_pct: number | null
  frais_transaction_payes: number
  repartition_geo: RepartitionItem[]
  repartition_sector: RepartitionItem[]
  repartition_geo_detaillee: RepartitionItem[]
  repartition_sector_detaillee: RepartitionItem[]
  composition_actions: FundTopHoldingItem[]
  // Détenteurs (backlog 2.L.1) : quotités saisies + part détenue/nette calculée.
  quotites: QuotiteDetenteurItem[]
  // Fiche immobilier complète (backlog 2.M.3) : `null` tant qu'aucun détail n'a été
  // saisi pour cette ligne.
  immobilier: HoldingImmobilier | null
  // Valeur courante manuelle et sa date (backlog 2.S.1) — "à jour au ..." sur
  // l'écran Épargne ; l'historique complet vient de `getHoldingValuationHistory`.
  valeur_estimee: number | null
  date_valeur_estimee: string | null
  versement_mensuel: number | null
  // Date d'acquisition déclarée (backlog § 2.S.3) — utilisée par
  // `rendement_annualise_pct` ci-dessus et pour ancrer le graphique d'historique de
  // valorisation (`ValorisationHistoriqueCard`).
  date_acquisition: string | null
}

// Fiche immobilier (backlog 2.M.3) : bloc location + caractéristiques saisis par
// l'utilisateur, cashflow/rentabilité/prix au m² calculés côté serveur (jamais
// recalculés côté frontend, même discipline que `Holding.valeur`).
export interface HoldingImmobilier {
  type_location: string | null
  loyer_mensuel: number | null
  charges_mensuelles: number | null
  frais_annuels: number | null
  surface_m2: number | null
  nb_pieces: number | null
  annee_construction: number | null
  dpe: string | null
  cashflow_mensuel: number | null
  rentabilite_brute_pct: number | null
  rentabilite_nette_pct: number | null
  prix_m2: number | null
  emprunt_mensualite: number | null
}

export interface HoldingImmobilierInput {
  type_location?: string | null
  loyer_mensuel?: number | null
  charges_mensuelles?: number | null
  frais_annuels?: number | null
  surface_m2?: number | null
  nb_pieces?: number | null
  annee_construction?: number | null
  dpe?: string | null
}
