import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import type { Holding, ValuationHistoryPoint } from '../api/types'
import { usePreferencesAffichage } from '../hooks/usePreferencesAffichage'
import { TYPE_ACTIF_OPTIONS, TYPES_EPARGNE } from '../utils/holdingCategories'
import { formatDate, formatEuro } from '../utils/format'
import { AjoutValorisationForm } from './AjoutValorisationForm'
import Modale from './Modale'
import { ValorisationHistoriqueCard } from './ValorisationHistoriqueCard'

const OPTIONS_EPARGNE = TYPE_ACTIF_OPTIONS.filter((o) => TYPES_EPARGNE.has(o.value))

function libelleTypeEpargne(typeActif: string | null): string {
  return OPTIONS_EPARGNE.find((o) => o.value === typeActif)?.label ?? (typeActif ?? '—')
}

/** Formulaire d'édition du nom et du versement mensuel d'une ligne d'épargne
 * (backlog 2.S.1, retour utilisateur du 25/08 : rien ne permettait de corriger un
 * versement mensuel une fois déclaré). Ne touche jamais à `valeur_estimee`/
 * `date_valeur_estimee` — ces champs passent uniquement par « Ajouter une
 * valorisation », pour ne jamais casser la cohérence de l'historique daté. */
function ModifierLigneEpargneForm({ holding, onSaved, onCancel }: { holding: Holding; onSaved: (h: Holding) => void; onCancel: () => void }) {
  const [nom, setNom] = useState(holding.nom ?? '')
  const [versementMensuel, setVersementMensuel] = useState(holding.versement_mensuel !== null ? String(holding.versement_mensuel) : '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const h = await api.updateHolding(holding.id, {
        nom: nom.trim() || null,
        versement_mensuel: versementMensuel ? Number(versementMensuel) : null,
      })
      onSaved(h)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1 text-xs font-medium text-texte-attenue">
        Nom du compte
        <input
          type="text"
          value={nom}
          onChange={(e) => setNom(e.target.value)}
          className="w-48 rounded-md border border-bordure bg-surface px-2 py-1.5 text-sm text-texte"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-texte-attenue">
        Versement mensuel (€)
        <input
          type="number"
          step="any"
          min={0}
          value={versementMensuel}
          onChange={(e) => setVersementMensuel(e.target.value)}
          placeholder="optionnel"
          className="w-32 rounded-md border border-bordure bg-surface px-2 py-1.5 text-sm text-texte"
        />
      </label>
      <button
        type="submit"
        disabled={saving}
        className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-surface disabled:opacity-40"
      >
        {saving ? 'Enregistrement...' : 'Enregistrer'}
      </button>
      <button type="button" onClick={onCancel} className="text-sm font-medium text-texte-attenue hover:text-texte">
        Annuler
      </button>
      {error && <span className="text-sm text-negatif">{error}</span>}
    </form>
  )
}

/** Une ligne d'épargne (assurance-vie, PER, épargne réglementée/salariale, compte
 * courant) — valeur actuelle, versement mensuel déclaré, historique daté et ajout
 * rapide d'un point, avec édition et suppression en place. Extrait de l'ancienne
 * `EpargnePage.tsx` (fusionnée dans l'écran Comptes le 03/09/2026, demande directe
 * de l'utilisateur : « fusionner les écrans Épargne et Compte ») pour être
 * réutilisé dans `CompteDetailContent` — une ligne d'épargne étant 1:1 avec son
 * compte par convention, c'est là qu'elle vit désormais, à la place du simple lien
 * vers la fiche détaillée qu'affichent les autres types de lignes.
 *
 * Gère son propre historique (requête indépendante par ligne, comme
 * `DetenteursSection`/`useImmobilierDetail` pour la fiche détaillée), pour ne pas
 * coupler le chargement de toutes les lignes du compte entre elles. */
export default function LigneEpargne({ holding, onChanged, onDeleted }: { holding: Holding; onChanged: () => void; onDeleted: () => void }) {
  const { montantsMasques } = usePreferencesAffichage()
  // `null` = jamais chargé. L'historique ne sert QUE dans le bloc déplié
  // ci-dessous : le charger au montage faisait une requête PAR ligne d'épargne dès
  // l'ouverture du compte, pour une donnée que l'utilisateur ne regarde qu'après
  // avoir déplié une ligne (backlog Z.1). Chargé à la première ouverture, puis
  // conservé — rouvrir ne redemande rien.
  const [historique, setHistorique] = useState<ValuationHistoryPoint[] | null>(null)
  const [ouvert, setOuvert] = useState(false)
  const [edition, setEdition] = useState(false)
  const [confirmSuppression, setConfirmSuppression] = useState(false)
  const [suppression, setSuppression] = useState(false)
  const [erreurSuppression, setErreurSuppression] = useState<string | null>(null)
  const [nomActuel, setNomActuel] = useState(holding.nom)
  const [versementActuel, setVersementActuel] = useState(holding.versement_mensuel)
  const [valeurActuelle, setValeurActuelle] = useState(holding.valeur_estimee)
  const [dateValeurActuelle, setDateValeurActuelle] = useState(holding.date_valeur_estimee)

  function rechargerHistorique() {
    api
      .getHoldingValuationHistory(holding.ticker)
      .then(setHistorique)
      .catch(() => setHistorique([]))
  }

  useEffect(() => {
    if (!ouvert || historique !== null) return
    rechargerHistorique()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `rechargerHistorique` est recréée à chaque rendu ; la garde `historique !== null` suffit à ne charger qu'une fois.
  }, [ouvert, historique, holding.ticker])

  function handleValorisationAjoutee(h: Holding) {
    setValeurActuelle(h.valeur_estimee)
    setDateValeurActuelle(h.date_valeur_estimee)
    rechargerHistorique()
    onChanged()
  }

  function handleLigneModifiee(h: Holding) {
    setNomActuel(h.nom)
    setVersementActuel(h.versement_mensuel)
    setEdition(false)
    onChanged()
  }

  async function handleSupprimer() {
    setSuppression(true)
    setErreurSuppression(null)
    try {
      await api.deleteHolding(holding.id)
      onDeleted()
    } catch (err) {
      setErreurSuppression((err as Error).message)
      setSuppression(false)
    }
  }

  return (
    <div className="py-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <Link to={`/patrimoine/${encodeURIComponent(holding.ticker)}`} className="text-sm font-medium text-texte hover:underline">
            {nomActuel ?? holding.ticker}
          </Link>
          <p className="text-xs text-texte-attenue">{libelleTypeEpargne(holding.type_actif)}</p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <button type="button" onClick={() => setEdition((v) => !v)} className="text-xs font-medium text-accent hover:underline">
            {edition ? 'Fermer' : 'Modifier'}
          </button>
          <button type="button" onClick={() => setOuvert((v) => !v)} className="text-xs font-medium text-accent hover:underline">
            {ouvert ? 'Fermer' : 'Ajouter une valorisation'}
          </button>
          <button type="button" onClick={() => setConfirmSuppression(true)} className="text-xs font-medium text-negatif hover:underline">
            Supprimer
          </button>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div>
          <p className="text-xs text-texte-attenue">Valeur actuelle</p>
          <p className="font-medium text-texte">{formatEuro(valeurActuelle, 2, montantsMasques)}</p>
          {dateValeurActuelle && <p className="text-xs text-texte-attenue">au {formatDate(dateValeurActuelle)}</p>}
        </div>
        <div>
          <p className="text-xs text-texte-attenue">Versement mensuel</p>
          <p className="font-medium text-texte">{versementActuel !== null ? formatEuro(versementActuel, 2, montantsMasques) : '—'}</p>
        </div>
      </div>

      {edition && (
        <div className="mt-4 border-t border-bordure pt-4">
          <ModifierLigneEpargneForm holding={holding} onSaved={handleLigneModifiee} onCancel={() => setEdition(false)} />
        </div>
      )}

      {ouvert && (
        <div className="mt-4 border-t border-bordure pt-4">
          <AjoutValorisationForm ticker={holding.ticker} historique={historique ?? []} onAdded={handleValorisationAjoutee} />
        </div>
      )}

      <div className="mt-4">
        <ValorisationHistoriqueCard
          ticker={holding.ticker}
          historique={historique ?? []}
          onChanged={handleValorisationAjoutee}
          dateAcquisition={holding.date_acquisition}
          prixRevientMoyen={holding.prix_revient_moyen}
        />
      </div>

      {confirmSuppression && (
        <Modale onClose={() => setConfirmSuppression(false)} panelClassName="w-full max-w-sm rounded-xl bg-surface p-6 shadow-xl">
          {({ titleId }) => (
            <>
              <h2 id={titleId} className="text-lg font-semibold text-texte">
                Supprimer cette ligne ?
              </h2>
              <p className="mt-2 text-sm text-texte">
                <span className="font-medium text-texte">{nomActuel ?? holding.ticker}</span> et tout son historique de
                valorisation seront définitivement supprimés.
              </p>
              <div className="mt-5 flex justify-end gap-2">
                <button
                  onClick={() => setConfirmSuppression(false)}
                  disabled={suppression}
                  className="rounded-md px-4 py-2 text-sm font-medium text-texte-attenue hover:bg-surface-elevee disabled:opacity-40"
                >
                  Annuler
                </button>
                <button
                  onClick={handleSupprimer}
                  disabled={suppression}
                  className="rounded-md bg-negatif px-4 py-2 text-sm font-medium text-surface hover:opacity-90 disabled:opacity-40"
                >
                  {suppression ? 'Suppression...' : 'Supprimer'}
                </button>
              </div>
              {erreurSuppression && <p className="mt-2 text-sm text-negatif">{erreurSuppression}</p>}
            </>
          )}
        </Modale>
      )}
    </div>
  )
}
