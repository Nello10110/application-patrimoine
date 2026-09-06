import { api } from '../api/client'

/** Cache des logos réels d'établissement (retour utilisateur, 05/09/2026), partagé
 * par tout l'écran.
 *
 * Portée module plutôt que contexte React : `EtablissementLogo` est affiché un peu
 * partout (liste des comptes, carte Établissements, sélecteurs), souvent loin de
 * tout fournisseur commun — un cache de module évite de faire traverser la même
 * donnée à travers dix composants, et garantit UN SEUL appel réseau par chargement
 * de page quel que soit le nombre de badges affichés.
 *
 * Les images ne peuvent pas être de simples `<img src="/api/...">` : l'API
 * s'authentifie par un en-tête `Authorization: Bearer`, qu'une balise `<img>`
 * n'envoie pas. Elles arrivent donc en data URI par un unique appel. */

let cache: Record<string, string> | null = null
let chargement: Promise<Record<string, string>> | null = null
const abonnes = new Set<() => void>()

function notifier(): void {
  for (const abonne of abonnes) abonne()
}

/** Charge (une fois) la table des logos. Un échec réseau n'est jamais propagé :
 * l'absence de logo est un cas normal (aucun n'a encore été posé), et un badge
 * généré s'affiche à la place — jamais une erreur à l'écran pour une décoration. */
export function chargerLogos(): Promise<Record<string, string>> {
  if (cache) return Promise.resolve(cache)
  if (!chargement) {
    // `try` autour de l'appel lui-même, pas seulement `.catch` : un badge décoratif
    // ne doit jamais faire tomber l'écran qui le porte, quelle que soit la panne.
    let appel: Promise<Record<string, string>>
    try {
      appel = api.getLogosEtablissements()
    } catch {
      appel = Promise.resolve({})
    }
    chargement = appel
      .catch(() => ({}) as Record<string, string>)
      .then((logos) => {
        cache = logos
        chargement = null
        notifier()
        return logos
      })
  }
  return chargement
}

/** À appeler après toute modification de logo (pose, remplacement, suppression) :
 * vide le cache et relance le chargement, ce qui rafraîchit tous les badges montés. */
export function invaliderLogos(): void {
  cache = null
  chargement = null
  notifier()
  void chargerLogos()
}

export function logoDe(etablissementId: number | null | undefined): string | undefined {
  if (etablissementId === null || etablissementId === undefined) return undefined
  return cache?.[String(etablissementId)]
}

export function sAbonner(callback: () => void): () => void {
  abonnes.add(callback)
  return () => {
    abonnes.delete(callback)
  }
}

/** Remise à zéro complète — réservée aux tests (chaque cas doit repartir d'un cache
 * vide, sans quoi le premier test contaminerait les suivants). */
export function reinitialiserPourTests(): void {
  cache = null
  chargement = null
  abonnes.clear()
}
