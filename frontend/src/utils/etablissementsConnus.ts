/** Catalogue d'établissements connus (refonte import, 05/09/2026, demande directe
 * de l'utilisateur : « une liste des établissements... et en ajouter des
 * customs »), consommé par `CatalogueEtablissementPicker`/`EtablissementLogo`.
 *
 * Chaque entrée est un badge GÉNÉRÉ (initiales + couleur de marque approximative),
 * jamais un logo réel : reproduire les logos officiels poserait un risque de
 * droits et demanderait de télécharger des images depuis internet — un badge
 * généré suffit à distinguer visuellement les établissements sans ce risque.
 * `cle` est stockée telle quelle dans `Etablissement.logo_key` ; une clé absente de
 * ce catalogue (établissement personnalisé, ou catalogue qui aurait changé) retombe
 * simplement sur le badge neutre de `EtablissementLogo`. */
export interface EtablissementConnu {
  cle: string
  nom: string
  couleur: string
  initiales: string
}

export const CATALOGUE_ETABLISSEMENTS: EtablissementConnu[] = [
  { cle: 'trade_republic', nom: 'Trade Republic', couleur: '#1b1b1f', initiales: 'TR' },
  { cle: 'boursorama', nom: 'Boursorama Banque', couleur: '#e2001a', initiales: 'BO' },
  { cle: 'bourse_direct', nom: 'Bourse Direct', couleur: '#0057a3', initiales: 'BD' },
  { cle: 'degiro', nom: 'Degiro', couleur: '#003d4c', initiales: 'DG' },
  { cle: 'interactive_brokers', nom: 'Interactive Brokers', couleur: '#d4310a', initiales: 'IB' },
  { cle: 'saxo', nom: 'Saxo Banque', couleur: '#2d2d87', initiales: 'SX' },
  { cle: 'fortuneo', nom: 'Fortuneo', couleur: '#6a2c8f', initiales: 'FO' },
  { cle: 'bforbank', nom: 'BforBank', couleur: '#e01e5a', initiales: 'BF' },
  { cle: 'credit_agricole', nom: 'Crédit Agricole', couleur: '#00895e', initiales: 'CA' },
  { cle: 'societe_generale', nom: 'Société Générale', couleur: '#e30613', initiales: 'SG' },
  { cle: 'bnp_paribas', nom: 'BNP Paribas', couleur: '#00915a', initiales: 'BN' },
  { cle: 'caisse_epargne', nom: "Caisse d'Épargne", couleur: '#e2001a', initiales: 'CE' },
]

export function trouverEtablissementConnu(cle: string | null | undefined): EtablissementConnu | undefined {
  if (!cle) return undefined
  return CATALOGUE_ETABLISSEMENTS.find((e) => e.cle === cle)
}
