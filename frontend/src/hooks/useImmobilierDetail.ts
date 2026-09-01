import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { HoldingDetail, ValuationHistoryPoint } from '../api/types'

export interface FormImmobilier {
  type_location: string
  loyer_mensuel: string
  charges_mensuelles: string
  frais_annuels: string
  surface_m2: string
  nb_pieces: string
  annee_construction: string
  dpe: string
}

function formulaireDepuis(immo: HoldingDetail['immobilier']): FormImmobilier {
  return {
    type_location: immo?.type_location ?? '',
    loyer_mensuel: immo?.loyer_mensuel !== null && immo?.loyer_mensuel !== undefined ? String(immo.loyer_mensuel) : '',
    charges_mensuelles:
      immo?.charges_mensuelles !== null && immo?.charges_mensuelles !== undefined ? String(immo.charges_mensuelles) : '',
    frais_annuels: immo?.frais_annuels !== null && immo?.frais_annuels !== undefined ? String(immo.frais_annuels) : '',
    surface_m2: immo?.surface_m2 !== null && immo?.surface_m2 !== undefined ? String(immo.surface_m2) : '',
    nb_pieces: immo?.nb_pieces !== null && immo?.nb_pieces !== undefined ? String(immo.nb_pieces) : '',
    annee_construction:
      immo?.annee_construction !== null && immo?.annee_construction !== undefined ? String(immo.annee_construction) : '',
    dpe: immo?.dpe ?? '',
  }
}

/** État + logique de la fiche immobilier (backlog 2.M.3), extrait en hook pour que
 * son affichage puisse être scindé entre deux onglets (backlog 2.M.4) : le
 * formulaire de caractéristiques dans *Paramètres*, le cashflow/rentabilités/
 * historique — calculés côté serveur, jamais recalculés ici — dans *Aperçu*.
 * Toujours appelé (règle des hooks), `chargerHistorique` désactive juste la requête
 * réseau pour toute ligne qui n'est ni `REAL_ESTATE` ni de type Épargne (backlog
 * 2.S.1 — l'historique daté n'est pas réservé à l'immobilier malgré le nom du hook). */
export function useImmobilierDetail(ticker: string, chargerHistorique: boolean, immobilierInitial: HoldingDetail['immobilier']) {
  const [immobilier, setImmobilier] = useState(immobilierInitial)
  const [form, setForm] = useState<FormImmobilier>(() => formulaireDepuis(immobilierInitial))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [historique, setHistorique] = useState<ValuationHistoryPoint[]>([])

  const rechargerHistorique = () => {
    api
      .getHoldingValuationHistory(ticker)
      .then(setHistorique)
      .catch(() => setHistorique([]))
  }

  useEffect(() => {
    if (!chargerHistorique) return
    rechargerHistorique()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `ticker` change = remontage du composant parent (route/modale).
  }, [ticker, chargerHistorique])

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      await api.updateHoldingImmobilier(ticker, {
        type_location: form.type_location || null,
        loyer_mensuel: form.loyer_mensuel ? Number(form.loyer_mensuel) : null,
        charges_mensuelles: form.charges_mensuelles ? Number(form.charges_mensuelles) : null,
        frais_annuels: form.frais_annuels ? Number(form.frais_annuels) : null,
        surface_m2: form.surface_m2 ? Number(form.surface_m2) : null,
        nb_pieces: form.nb_pieces ? Number(form.nb_pieces) : null,
        annee_construction: form.annee_construction ? Number(form.annee_construction) : null,
        dpe: form.dpe || null,
      })
      // Cashflow/rentabilité/prix au m² sont calculés côté serveur (jamais recalculés
      // ici) : on relit la fiche complète pour les obtenir à jour, même pattern que
      // `DetenteursSection` après l'enregistrement d'une quotité.
      const detailFrais = await api.getHoldingDetail(ticker)
      setImmobilier(detailFrais.immobilier)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return { immobilier, form, setForm, saving, error, handleSave, historique, rechargerHistorique }
}
