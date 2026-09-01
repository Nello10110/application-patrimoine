import { useState } from 'react'
import type { Holding, HoldingDetail, ValuationHistoryPoint } from '../api/types'
import { AjoutValorisationForm } from './AjoutValorisationForm'
import Card from './Card'
import { ValorisationHistoriqueCard } from './ValorisationHistoriqueCard'
import { usePreferencesAffichage } from '../hooks/usePreferencesAffichage'
import { formatDate, formatEuro } from '../utils/format'

/** Onglet *Aperçu* d'un compte Épargne (backlog 2.S.1) : historique daté + versement
 * mensuel déclaré + ajout rapide d'un point — remplace la courbe de cours (sans
 * objet pour un actif non coté) pour les 5 types couverts par `TYPES_EPARGNE`. */
export default function EpargneApercu({
  detail,
  historique,
  onValorisationAjoutee,
}: {
  detail: HoldingDetail
  historique: ValuationHistoryPoint[]
  onValorisationAjoutee: () => void
}) {
  const { montantsMasques } = usePreferencesAffichage()
  // Copie locale rafraîchie depuis la réponse de `setHoldingValorisation` (qui
  // renvoie le holding à jour) : évite de dépendre d'un rechargement complet de la
  // fiche parente juste pour refléter l'antidatage-safe côté "valeur actuelle".
  const [valeurActuelle, setValeurActuelle] = useState(detail.valeur_estimee)
  const [dateValeurActuelle, setDateValeurActuelle] = useState(detail.date_valeur_estimee)

  function handleValorisationAjoutee(holding: Holding) {
    setValeurActuelle(holding.valeur_estimee)
    setDateValeurActuelle(holding.date_valeur_estimee)
    onValorisationAjoutee()
  }

  return (
    <>
      <Card>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-texte-attenue">Valeur actuelle</p>
            <p className="mt-1 text-lg font-semibold text-texte">{formatEuro(valeurActuelle, 2, montantsMasques)}</p>
            {dateValeurActuelle && <p className="mt-1 text-xs text-texte-attenue">à jour au {formatDate(dateValeurActuelle)}</p>}
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-texte-attenue">Versement mensuel déclaré</p>
            <p className="mt-1 text-lg font-semibold text-texte">
              {detail.versement_mensuel !== null ? formatEuro(detail.versement_mensuel, 2, montantsMasques) : '—'}
            </p>
            <p className="mt-1 text-xs text-texte-attenue">additionné au préremplissage du Simulateur</p>
          </div>
        </div>
      </Card>

      <ValorisationHistoriqueCard
        ticker={detail.ticker}
        historique={historique}
        onChanged={handleValorisationAjoutee}
        dateAcquisition={detail.date_acquisition}
        prixRevientMoyen={detail.prix_revient_moyen}
      />

      <Card title="Ajouter une valorisation">
        <p className="mb-3 text-xs text-texte-attenue">
          Un point antidaté (rattrapage a posteriori) ne remplace jamais la valeur actuelle si une date plus récente est déjà
          connue.
        </p>
        <AjoutValorisationForm ticker={detail.ticker} historique={historique} onAdded={handleValorisationAjoutee} />
      </Card>
    </>
  )
}
