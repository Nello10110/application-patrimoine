// État du rafraîchissement des cours en tâche de fond (LOT 4B), renvoyé par
// `POST /market-data/refresh` (202, état de démarrage) et sondé via
// `GET /market-data/refresh/status` — également utilisé par "Lancer maintenant"
// depuis la page Réglages, qui déclenche le même exécuteur partagé.
export interface EtatRafraichissement {
  en_cours: boolean
  positions_traitees: number
  positions_total: number
  demarre_le: string | null
  termine_le: string | null
  statut: 'ok' | 'erreur' | null
  message: string | null
}

// Réglages applicatifs persistants (LOT 5B).
export interface Preferences {
  methode_cout: 'cout_moyen_pondere' | 'fifo'
  // Taux d'imposition SAISI par l'utilisateur (backlog 2.Q.2) : une donnée reprise
  // telle quelle dans la déclaration de patrimoine, jamais un calcul fiscal.
  taux_imposition_pct: number | null
}

export interface PreferencesUpdateResponse extends Preferences {
  // Nombre de positions recalculées si le changement de méthode a déclenché une
  // reconstruction du portefeuille (LOT 5.6), `null` sinon.
  positions_recalculees: number | null
}

export interface ScheduledJob {
  job_key: string
  enabled: boolean
  intervalle_heures: number
  derniere_execution: string | null
  dernier_statut: 'ok' | 'erreur' | null
  dernier_message: string | null
}

// Écran d'aide (FAQ) : les 6 zones géographiques et leurs pays, en miroir de
// `services/reference_indices.zones_geographiques` côté backend — jamais une
// liste dupliquée à la main, pour rester toujours fidèle au classement réel.
export interface ZoneGeographiqueInfo {
  zone: string
  pays: string[]
}
