import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { HoldingDetail, ValuationHistoryPoint } from '../api/types'

export interface FormImmobilier {
  type_location: string
  loyer_mensuel: string
  charges_mensuelles: string
  frais_annuels: string
  frais_notaire: string
  frais_travaux: string
  frais_acquisition_autres: string
  surface_m2: string
  nb_pieces: string
  annee_construction: string
  dpe: string
  residence_principale: boolean
  simulation_loyer_estime: string
  simulation_taxe_habitation_annuelle: string
  simulation_charges_mensuelles: string
}

function versChaine(v: number | null | undefined): string {
  return v !== null && v !== undefined ? String(v) : ''
}

function formulaireDepuis(immo: HoldingDetail['immobilier']): FormImmobilier {
  return {
    type_location: immo?.type_location ?? '',
    loyer_mensuel: versChaine(immo?.loyer_mensuel),
    charges_mensuelles: versChaine(immo?.charges_mensuelles),
    frais_annuels: versChaine(immo?.frais_annuels),
    frais_notaire: versChaine(immo?.frais_notaire),
    frais_travaux: versChaine(immo?.frais_travaux),
    frais_acquisition_autres: versChaine(immo?.frais_acquisition_autres),
    surface_m2: versChaine(immo?.surface_m2),
    nb_pieces: versChaine(immo?.nb_pieces),
    annee_construction: versChaine(immo?.annee_construction),
    dpe: immo?.dpe ?? '',
    residence_principale: immo?.residence_principale ?? false,
    simulation_loyer_estime: versChaine(immo?.simulation_loyer_estime),
    simulation_taxe_habitation_annuelle: versChaine(immo?.simulation_taxe_habitation_annuelle),
    simulation_charges_mensuelles: versChaine(immo?.simulation_charges_mensuelles),
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
        frais_notaire: form.frais_notaire ? Number(form.frais_notaire) : null,
        frais_travaux: form.frais_travaux ? Number(form.frais_travaux) : null,
        frais_acquisition_autres: form.frais_acquisition_autres ? Number(form.frais_acquisition_autres) : null,
        surface_m2: form.surface_m2 ? Number(form.surface_m2) : null,
        nb_pieces: form.nb_pieces ? Number(form.nb_pieces) : null,
        annee_construction: form.annee_construction ? Number(form.annee_construction) : null,
        dpe: form.dpe || null,
        residence_principale: form.residence_principale,
        simulation_loyer_estime: form.simulation_loyer_estime ? Number(form.simulation_loyer_estime) : null,
        simulation_taxe_habitation_annuelle: form.simulation_taxe_habitation_annuelle
          ? Number(form.simulation_taxe_habitation_annuelle)
          : null,
        simulation_charges_mensuelles: form.simulation_charges_mensuelles ? Number(form.simulation_charges_mensuelles) : null,
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
