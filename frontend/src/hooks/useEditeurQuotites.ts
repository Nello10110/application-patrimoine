import { useCallback, useEffect, useState } from 'react'
import { api } from '../api/client'
import type { Detenteur, QuotiteEntree } from '../api/types'

/** Tolérance sur la somme des quotités, en points de pourcentage.
 *
 * Elle vivait en trois exemplaires : constante nommée dans `CompteDetailContent` et
 * `LoansCard`, littéral `0.01` en dur dans `DetenteursSection`. Trois copies d'une
 * règle financière qui avaient DÉJÀ commencé à diverger (revue du 03/09/2026) — la
 * modifier obligeait à retrouver les trois, et en oublier une passait inaperçu. */
export const TOLERANCE_SOMME_PCT = 0.01

/** Logique partagée par les trois éditeurs de quotités (actif, compte, emprunt).
 *
 * Ce qui différait légitimement entre eux — présentation compacte ou en tableau,
 * pré-remplissage ou formulaire vierge, rechargement après enregistrement — reste
 * chez l'appelant. Ce qui est ici est ce qui doit rester identique : le chargement
 * des détenteurs, la règle des 100 %, et la construction du payload.
 *
 * `valeursInitiales` : pré-remplissage (fiche d'un actif). Absent, le formulaire
 * s'ouvre vierge — choix délibéré pour un compte, où réconcilier des répartitions
 * divergentes entre lignes serait fragile.
 *
 * `apresEnregistrement` : rechargement optionnel (la fiche d'un actif recalcule
 * part détenue/nette côté serveur). */
export function useEditeurQuotites(options: {
  enregistrer: (quotites: QuotiteEntree[]) => Promise<unknown>
  valeursInitiales?: QuotiteEntree[]
  apresEnregistrement?: () => Promise<void> | void
}) {
  const { enregistrer, valeursInitiales, apresEnregistrement } = options
  // `null` = chargement en cours, `[]` = aucun détenteur déclaré. La distinction
  // compte : les trois éditeurs s'effacent quand la liste est vide, ce qui rendait
  // un échec réseau indiscernable de « aucun détenteur » — le bloc disparaissait
  // sans message ni bouton Réessayer (revue du 03/09/2026).
  const [detenteurs, setDetenteurs] = useState<Detenteur[] | null>(null)
  const [erreurChargement, setErreurChargement] = useState<string | null>(null)
  const [saisie, setSaisie] = useState<Record<number, string>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [enregistre, setEnregistre] = useState(false)

  const charger = useCallback(() => {
    setErreurChargement(null)
    api
      .listDetenteurs()
      .then((liste) => {
        setDetenteurs(liste)
        if (valeursInitiales) {
          const init: Record<number, string> = {}
          for (const q of valeursInitiales) init[q.detenteur_id] = String(q.quotite_pct)
          setSaisie(init)
        }
      })
      .catch((err: Error) => {
        setDetenteurs([])
        setErreurChargement(err.message)
      })
    // `valeursInitiales` est un tableau reconstruit à chaque rendu du parent :
    // l'inclure relancerait le chargement en boucle. Le pré-remplissage n'a de sens
    // qu'au montage, le composant étant remonté quand la cible change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(charger, [charger])

  const setValeur = useCallback((detenteurId: number, valeur: string) => {
    setSaisie((precedent) => ({ ...precedent, [detenteurId]: valeur }))
  }, [])

  const liste = detenteurs ?? []
  const total = liste.reduce((somme, d) => somme + (Number(saisie[d.id]) || 0), 0)
  const repartitionEnCours = liste.some((d) => (Number(saisie[d.id]) || 0) > 0)
  const totalValide = !repartitionEnCours || Math.abs(total - 100) < TOLERANCE_SOMME_PCT

  async function handleSave() {
    setSaving(true)
    setError(null)
    setEnregistre(false)
    try {
      const quotites = liste
        .map((d) => ({ detenteur_id: d.id, quotite_pct: Number(saisie[d.id]) || 0 }))
        .filter((q) => q.quotite_pct > 0)
      await enregistrer(quotites)
      await apresEnregistrement?.()
      setEnregistre(true)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return {
    detenteurs,
    erreurChargement,
    rechargerDetenteurs: charger,
    saisie,
    setValeur,
    total,
    totalValide,
    saving,
    error,
    enregistre,
    handleSave,
  }
}
