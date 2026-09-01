import type { Holding, HoldingDetail, ValuationHistoryPoint } from '../api/types'
import Card from './Card'
import { ValorisationHistoriqueCard } from './ValorisationHistoriqueCard'
import { usePreferencesAffichage } from '../hooks/usePreferencesAffichage'
import { formatEuro, formatPct } from '../utils/format'

/** Onglet *Aperçu* de la fiche immobilier (backlog 2.M.4) : cashflow/rentabilités/
 * prix au m² déjà calculés côté serveur, et l'historique daté des valorisations —
 * jamais écrasé, une nouvelle ligne à chaque changement réel de `valeur_estimee`.
 * Remplace la courbe de cours (sans objet pour un bien non coté). */
export default function ImmobilierApercu({
  ticker,
  immobilier,
  historique,
  onHistoriqueChanged,
  dateAcquisition,
  prixRevientMoyen,
}: {
  ticker: string
  immobilier: HoldingDetail['immobilier']
  historique: ValuationHistoryPoint[]
  onHistoriqueChanged: (holding: Holding) => void
  dateAcquisition: HoldingDetail['date_acquisition']
  prixRevientMoyen: HoldingDetail['prix_revient_moyen']
}) {
  const { montantsMasques } = usePreferencesAffichage()

  return (
    <>
      {immobilier && (immobilier.cashflow_mensuel !== null || immobilier.prix_m2 !== null) && (
        <Card title="Cashflow et rentabilité">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {immobilier.cashflow_mensuel !== null && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-texte-attenue">Cashflow mensuel</p>
                <p className={`mt-1 text-lg font-semibold ${immobilier.cashflow_mensuel >= 0 ? 'text-positif' : 'text-negatif'}`}>
                  {formatEuro(immobilier.cashflow_mensuel, 2, montantsMasques)}
                </p>
                <p className="mt-1 text-xs text-texte-attenue">loyer − charges − frais/12 − mensualité</p>
              </div>
            )}
            {immobilier.rentabilite_brute_pct !== null && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-texte-attenue">Rentabilité brute</p>
                <p className="mt-1 text-lg font-semibold text-texte">{formatPct(immobilier.rentabilite_brute_pct)}</p>
                <p className="mt-1 text-xs text-texte-attenue">loyer annuel / prix d'acquisition</p>
              </div>
            )}
            {immobilier.rentabilite_nette_pct !== null && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-texte-attenue">Rentabilité nette</p>
                <p className="mt-1 text-lg font-semibold text-texte">{formatPct(immobilier.rentabilite_nette_pct)}</p>
                <p className="mt-1 text-xs text-texte-attenue">(loyer − charges − frais) / prix d'acquisition</p>
              </div>
            )}
            {immobilier.prix_m2 !== null && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-texte-attenue">Prix au m²</p>
                <p className="mt-1 text-lg font-semibold text-texte">{formatEuro(immobilier.prix_m2, 2, montantsMasques)}</p>
              </div>
            )}
            {immobilier.emprunt_mensualite !== null && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-texte-attenue">Mensualité de l'emprunt rattaché</p>
                <p className="mt-1 text-lg font-semibold text-texte">{formatEuro(immobilier.emprunt_mensualite, 2, montantsMasques)}</p>
              </div>
            )}
          </div>
        </Card>
      )}

      <ValorisationHistoriqueCard
        ticker={ticker}
        historique={historique}
        onChanged={onHistoriqueChanged}
        dateAcquisition={dateAcquisition}
        prixRevientMoyen={prixRevientMoyen}
      />
    </>
  )
}
