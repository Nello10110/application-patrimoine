import { api } from '../api/client'

/** Cache des logos réels du CATALOGUE d'établissements (retour utilisateur du
 * 09/09/2026 : « avoir déjà les images des établissements affichées »), jumeau de
 * `logosEtablissements.ts` mais indexé par `logo_key` (« trade_republic »...)
 * plutôt que par un id d'établissement créé — ce cache existe déjà côté serveur
 * AVANT que l'utilisateur n'ait créé quoi que ce soit, cf. `EtablissementLogo` qui
 * l'interroge dans le sélecteur (`CatalogueEtablissementPicker`).
 *
 * Portée module, un seul appel réseau par chargement de page, même raison que
 * `logosEtablissements.ts` : ce cache est affiché par de nombreux endroits
 * (sélecteur d'établissement, carte Établissements) sans fournisseur React commun. */

let cache: Record<string, string> | null = null
let chargement: Promise<Record<string, string>> | null = null
const abonnes = new Set<() => void>()

function notifier(): void {
  for (const abonne of abonnes) abonne()
}

/** Charge (une fois) la table des logos du catalogue. Un échec réseau n'est jamais
 * propagé : l'absence de logo est un cas normal (pas encore récupéré, ou site qui
 * le refuse), un badge généré s'affiche à la place — jamais une erreur à l'écran
 * pour une décoration. */
export function chargerLogosCatalogue(): Promise<Record<string, string>> {
  if (cache) return Promise.resolve(cache)
  if (!chargement) {
    let appel: Promise<Record<string, string>>
    try {
      appel = api.getLogosCatalogue()
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

export function logoCatalogueDe(logoKey: string | null | undefined): string | undefined {
  if (!logoKey) return undefined
  return cache?.[logoKey]
}

export function sAbonnerCatalogue(callback: () => void): () => void {
  abonnes.add(callback)
  return () => {
    abonnes.delete(callback)
  }
}

/** Remise à zéro complète — réservée aux tests. */
export function reinitialiserPourTests(): void {
  cache = null
  chargement = null
  abonnes.clear()
}
