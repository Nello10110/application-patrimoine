import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import type { HoldingImmobilier, Loan } from '../api/types'
import Card from './Card'
import EtatErreur from './EtatErreur'
import EtatVide from './EtatVide'
import { DataPoint, Field, Select } from './Field'
import { SkeletonTexte } from './Skeleton'
import { usePreferencesAffichage } from '../hooks/usePreferencesAffichage'
import { formatEuro } from '../utils/format'

// Lien vers l'onglet Paramètres de la fiche du bien (`HoldingDetailContent` lit
// `?onglet=` au montage, retour utilisateur du 10/09/2026) — évite un clic
// supplémentaire une fois la fiche ouverte, pour les deux CTA ci-dessous
// (résidence principale non définie / simulateur incomplet).
function urlParametresBien(ticker: string): string {
  return `/patrimoine/${encodeURIComponent(ticker)}?onglet=parametres`
}

interface BienImmobilier {
  id: number
  ticker: string
  nom: string | null
  immobilier: HoldingImmobilier | null
}

interface BienResidencePrincipale {
  id: number
  ticker: string
  nom: string | null
  immobilier: HoldingImmobilier
}

/** Simulateur achat vs location pour la résidence principale (retour utilisateur du
 * 10/09/2026, page Analyse) : compare le loyer estimé d'un bien équivalent
 * (`HoldingImmobilier.simulation_loyer_estime`, saisi sur la fiche du bien via
 * `ImmobilierParametresForm`) au coût mensuel réel de la propriété — part
 * d'INTÉRÊTS de l'emprunt rattaché (le capital remboursé devient du patrimoine, pas
 * une dépense : arbitrage validé avec l'utilisateur) + charges de comparaison +
 * taxe d'habitation.
 *
 * Aucune API dédiée : `Loan.capital_restant_du`/`taux_annuel_pct` sont déjà exposés
 * tels quels (`loan_service.py`, jamais recalculés côté frontend ailleurs dans
 * l'app — ici on dérive un montant d'intérêt à partir de deux champs déjà calculés
 * serveur, pas une nouvelle logique d'amortissement). */
export default function SimulateurAchatLocationCard() {
  const { montantsMasques } = usePreferencesAffichage()
  const [biensImmobiliers, setBiensImmobiliers] = useState<BienImmobilier[] | null>(null)
  const [loans, setLoans] = useState<Loan[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [ticker, setTicker] = useState('')

  function charger() {
    setLoading(true)
    setError(null)
    api
      .listHoldings()
      .then(async (holdings) => {
        const loansList = await api.listLoans()
        setLoans(loansList)

        const immobiliers = holdings.filter((h) => h.type_actif === 'REAL_ESTATE')
        const details = await Promise.all(immobiliers.map((h) => api.getHoldingDetail(h.ticker)))
        const biens: BienImmobilier[] = immobiliers.map((h, i) => ({
          id: h.id,
          ticker: h.ticker,
          nom: details[i].nom,
          immobilier: details[i].immobilier,
        }))
        const residencesPrincipales = biens.filter((b): b is BienResidencePrincipale => b.immobilier?.residence_principale === true)

        setBiensImmobiliers(biens)
        setTicker((precedent) => (residencesPrincipales.some((b) => b.ticker === precedent) ? precedent : (residencesPrincipales[0]?.ticker ?? '')))
      })
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false))
  }

  useEffect(charger, [])

  if (loading) return <SkeletonTexte lignes={3} />
  if (error) return <EtatErreur message={error} onReessayer={charger} />

  if (!biensImmobiliers || biensImmobiliers.length === 0) {
    return (
      <Card title="Achat vs location">
        <EtatVide
          titre="Aucun bien immobilier enregistré"
          description={
            <Link to="/patrimoine" className="font-medium text-accent hover:underline">
              Ajouter un bien immobilier
            </Link>
          }
        />
      </Card>
    )
  }

  const residencesPrincipales = biensImmobiliers.filter((b): b is BienResidencePrincipale => b.immobilier?.residence_principale === true)

  if (residencesPrincipales.length === 0) {
    return (
      <Card title="Achat vs location">
        <EtatVide
          titre="Aucune résidence principale configurée"
          description={
            <span className="flex flex-col items-center gap-1">
              {biensImmobiliers.length === 1 ? (
                <>
                  Cochez « Résidence principale » sur la fiche du bien pour activer ce simulateur.
                  <Link to={urlParametresBien(biensImmobiliers[0].ticker)} className="font-medium text-accent hover:underline">
                    Configurer « {biensImmobiliers[0].nom ?? biensImmobiliers[0].ticker} »
                  </Link>
                </>
              ) : (
                <>
                  Cochez « Résidence principale » sur la fiche d'un de vos biens pour activer ce simulateur.
                  {biensImmobiliers.map((b) => (
                    <Link key={b.ticker} to={urlParametresBien(b.ticker)} className="font-medium text-accent hover:underline">
                      Configurer « {b.nom ?? b.ticker} »
                    </Link>
                  ))}
                </>
              )}
            </span>
          }
        />
      </Card>
    )
  }

  const bien = residencesPrincipales.find((b) => b.ticker === ticker) ?? residencesPrincipales[0]
  const { immobilier } = bien

  if (immobilier.simulation_loyer_estime === null) {
    return (
      <Card title="Achat vs location">
        {residencesPrincipales.length > 1 && (
          <SelecteurBien biens={residencesPrincipales} ticker={bien.ticker} onChange={setTicker} className="mb-4" />
        )}
        <EtatVide
          titre="Simulateur non configuré"
          description={
            <span className="flex flex-col items-center gap-1">
              {`Renseignez le loyer mensuel estimé sur la fiche « ${bien.nom ?? bien.ticker} » pour activer la comparaison.`}
              <Link to={urlParametresBien(bien.ticker)} className="font-medium text-accent hover:underline">
                Configurer le simulateur
              </Link>
            </span>
          }
        />
      </Card>
    )
  }

  const emprunt = loans.find((l) => l.holding_id === bien.id) ?? null
  const tauxMensuel = emprunt ? emprunt.taux_annuel_pct / 100 / 12 : 0
  const interetMensuel = emprunt ? emprunt.capital_restant_du * tauxMensuel : 0
  const chargesMensuelles = immobilier.simulation_charges_mensuelles ?? 0
  const taxeHabitationMensuelle = (immobilier.simulation_taxe_habitation_annuelle ?? 0) / 12
  const coutMensuelPossession = interetMensuel + chargesMensuelles + taxeHabitationMensuelle
  const loyerEstime = immobilier.simulation_loyer_estime
  const ecart = loyerEstime - coutMensuelPossession

  const fraisAcquisition = (immobilier.frais_notaire ?? 0) + (immobilier.frais_travaux ?? 0) + (immobilier.frais_acquisition_autres ?? 0)
  const moisDeLoyerEquivalent = fraisAcquisition > 0 && loyerEstime > 0 ? fraisAcquisition / loyerEstime : null

  return (
    <Card title="Achat vs location">
      {residencesPrincipales.length > 1 && (
        <SelecteurBien biens={residencesPrincipales} ticker={bien.ticker} onChange={setTicker} className="mb-4" />
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <DataPoint label="Loyer estimé (bien équivalent)" valeur={formatEuro(loyerEstime, 0, montantsMasques) + ' / mois'} />
        <DataPoint
          label="Coût mensuel de possession"
          valeur={formatEuro(coutMensuelPossession, 0, montantsMasques) + ' / mois'}
          note={emprunt ? 'Intérêts + charges + taxe d\'habitation' : "Charges + taxe d'habitation (pas d'emprunt rattaché)"}
        />
        <DataPoint
          label="Écart"
          valeur={(ecart >= 0 ? '+' : '') + formatEuro(ecart, 0, montantsMasques) + ' / mois'}
          ton={ecart >= 0 ? 'positif' : 'negatif'}
          note={ecart >= 0 ? 'Posséder coûte moins cher que louer' : 'Louer coûterait moins cher ce mois-ci'}
        />
      </div>

      {fraisAcquisition > 0 && (
        <p className="mt-4 text-xs text-texte-attenue">
          Frais d'acquisition versés : {formatEuro(fraisAcquisition, 0, montantsMasques)}
          {moisDeLoyerEquivalent !== null && ` (soit environ ${moisDeLoyerEquivalent.toFixed(1)} mois de loyer à ce tarif)`} — non
          inclus dans la comparaison mensuelle ci-dessus.
        </p>
      )}

      <p className="mt-2 text-xs text-texte-attenue">
        Comparaison indicative : seule la part d'intérêts du crédit compte (le capital remboursé reste votre patrimoine), hors
        évolution de la valeur du bien et hors placement alternatif de l'apport.
      </p>
    </Card>
  )
}

function SelecteurBien({
  biens,
  ticker,
  onChange,
  className = '',
}: {
  biens: BienResidencePrincipale[]
  ticker: string
  onChange: (ticker: string) => void
  className?: string
}) {
  return (
    <Field label="Bien" className={className}>
      <Select value={ticker} onChange={(e) => onChange(e.target.value)}>
        {biens.map((b) => (
          <option key={b.ticker} value={b.ticker}>
            {b.nom ?? b.ticker}
          </option>
        ))}
      </Select>
    </Field>
  )
}
