import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { Compte, Holding } from '../api/types'
import {
  TEXTE_PRIX_REVIENT,
  TEXTE_VALEUR_ESTIMEE,
  TYPE_ACTIF_OPTIONS,
  TYPES_AVEC_TAUX,
  TYPES_EPARGNE,
  TYPES_PATRIMOINE,
  ZONES_GEO,
  libelleTaux,
  valeurProjeteeUnAn,
} from '../utils/holdingCategories'
import Card from './Card'
import EtatErreur from './EtatErreur'
import InfoBulle from './InfoBulle'

// Sentinelle pour l'option "+ Nouveau compte..." du sélecteur — distincte de toute
// valeur réelle possible (un id de compte est toujours numérique).
const NOUVEAU_COMPTE = '__nouveau__'

const FORM_VIDE = {
  ticker: '',
  quantite: '',
  prix_revient_moyen: '',
  // Un id de compte existant (chaîne numérique), NOUVEAU_COMPTE, ou '' (aucun).
  compte_id: '',
  compte_nom: '',
  type_actif: '',
  valeur_estimee: '',
  taux_pct: '',
  zone_geo: '',
  versement_mensuel: '',
  date_acquisition: '',
}

/** Formulaire d'ajout manuel d'une position — extrait de `PortefeuillePage.tsx`
 * (2026-09-01) pour être réutilisable ailleurs, d'abord dans l'assistant de bienvenue
 * (`onboarding/EtapeDemarragePortefeuille.tsx`). Comportement strictement inchangé :
 * un seul formulaire pour tout type d'actif (financier coté ou manuel), champs
 * conditionnels selon `type_actif` sélectionné (`utils/holdingCategories.ts`).
 *
 * `onCreated` (callback, pas un état de liste porté ici) : ce composant ne connaît
 * jamais la liste des positions d'un appelant, seulement son propre formulaire —
 * l'appelant décide de la suite (recharger sa liste, incrémenter un compteur...),
 * même pattern que `onSaved` sur `PositionsTable`. */
export default function AjoutHoldingForm({ onCreated }: { onCreated?: (holding: Holding) => void }) {
  const [form, setForm] = useState(FORM_VIDE)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [comptes, setComptes] = useState<Compte[]>([])

  useEffect(() => {
    api.listComptes().then(setComptes).catch(() => setComptes([]))
  }, [])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!form.ticker.trim() || !form.quantite) return
    setSaving(true)
    setError(null)
    try {
      const nouveauCompte = form.compte_id === NOUVEAU_COMPTE
      const holding = await api.createHolding({
        ticker: form.ticker.trim().toUpperCase(),
        quantite: Number(form.quantite),
        prix_revient_moyen: form.prix_revient_moyen ? Number(form.prix_revient_moyen) : null,
        compte_id: !nouveauCompte && form.compte_id ? Number(form.compte_id) : null,
        compte_nom: nouveauCompte ? form.compte_nom.trim() || null : null,
        type_actif: form.type_actif || null,
        valeur_estimee: form.valeur_estimee ? Number(form.valeur_estimee) : null,
        taux_pct: form.taux_pct ? Number(form.taux_pct) : null,
        zone_geo: form.zone_geo || null,
        versement_mensuel: form.versement_mensuel ? Number(form.versement_mensuel) : null,
        date_acquisition: form.date_acquisition || null,
      })
      setForm(FORM_VIDE)
      // Un compte a pu être créé à la volée (`compte_nom`) : recharge la liste pour
      // qu'il apparaisse dans le sélecteur dès le prochain ajout.
      if (nouveauCompte) api.listComptes().then(setComptes).catch(() => {})
      onCreated?.(holding)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card title="Ajouter une ligne manuellement">
      <form onSubmit={handleAdd} className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs font-medium text-texte-attenue">
          Ticker
          <input
            value={form.ticker}
            onChange={(e) => setForm({ ...form, ticker: e.target.value })}
            className="w-28 rounded-md border border-bordure bg-surface px-2 py-1.5 text-sm text-texte"
            placeholder="AAPL"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-texte-attenue">
          Quantité
          <input
            value={form.quantite}
            onChange={(e) => setForm({ ...form, quantite: e.target.value })}
            type="number"
            step="any"
            className="w-28 rounded-md border border-bordure bg-surface px-2 py-1.5 text-sm text-texte"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-texte-attenue">
          <span className="inline-flex items-center gap-1">
            Prix de revient
            <InfoBulle texte={TEXTE_PRIX_REVIENT} />
          </span>
          <input
            value={form.prix_revient_moyen}
            onChange={(e) => setForm({ ...form, prix_revient_moyen: e.target.value })}
            type="number"
            step="any"
            className="w-32 rounded-md border border-bordure bg-surface px-2 py-1.5 text-sm text-texte"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-texte-attenue">
          Compte
          <select
            value={form.compte_id}
            onChange={(e) => setForm({ ...form, compte_id: e.target.value })}
            className="w-36 rounded-md border border-bordure bg-surface px-2 py-1.5 text-sm text-texte"
          >
            <option value="">— Aucun —</option>
            {comptes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nom}
              </option>
            ))}
            <option value={NOUVEAU_COMPTE}>+ Nouveau compte...</option>
          </select>
        </label>
        {form.compte_id === NOUVEAU_COMPTE && (
          <label className="flex flex-col gap-1 text-xs font-medium text-texte-attenue">
            Nom du nouveau compte
            <input
              value={form.compte_nom}
              onChange={(e) => setForm({ ...form, compte_nom: e.target.value })}
              className="w-36 rounded-md border border-bordure bg-surface px-2 py-1.5 text-sm text-texte"
              placeholder="PEA, CTO..."
            />
          </label>
        )}
        <label className="flex flex-col gap-1 text-xs font-medium text-texte-attenue">
          Type d'actif
          <select
            value={form.type_actif}
            onChange={(e) => setForm({ ...form, type_actif: e.target.value })}
            className="w-36 rounded-md border border-bordure bg-surface px-2 py-1.5 text-sm text-texte"
          >
            {TYPE_ACTIF_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-texte-attenue">
          <span className="inline-flex items-center gap-1">
            Valeur estimée
            <InfoBulle texte={TEXTE_VALEUR_ESTIMEE} />
          </span>
          <input
            value={form.valeur_estimee}
            onChange={(e) => setForm({ ...form, valeur_estimee: e.target.value })}
            type="number"
            step="any"
            className="w-32 rounded-md border border-bordure bg-surface px-2 py-1.5 text-sm text-texte"
            placeholder="optionnel"
          />
        </label>
        {TYPES_AVEC_TAUX.has(form.type_actif) && (
          <label className="flex flex-col gap-1 text-xs font-medium text-texte-attenue">
            {libelleTaux(form.type_actif)}
            <input
              value={form.taux_pct}
              onChange={(e) => setForm({ ...form, taux_pct: e.target.value })}
              type="number"
              step="any"
              className="w-32 rounded-md border border-bordure bg-surface px-2 py-1.5 text-sm text-texte"
              placeholder={form.type_actif === 'VEHICLE' ? '-15' : '3'}
            />
          </label>
        )}
        {TYPES_EPARGNE.has(form.type_actif) && (
          <label className="flex flex-col gap-1 text-xs font-medium text-texte-attenue">
            Versement mensuel (€)
            <input
              value={form.versement_mensuel}
              onChange={(e) => setForm({ ...form, versement_mensuel: e.target.value })}
              type="number"
              step="any"
              min={0}
              className="w-32 rounded-md border border-bordure bg-surface px-2 py-1.5 text-sm text-texte"
              placeholder="optionnel"
            />
          </label>
        )}
        {TYPES_PATRIMOINE.has(form.type_actif) && (
          <label className="flex flex-col gap-1 text-xs font-medium text-texte-attenue">
            Zone géographique
            <select
              value={form.zone_geo}
              onChange={(e) => setForm({ ...form, zone_geo: e.target.value })}
              className="w-40 rounded-md border border-bordure bg-surface px-2 py-1.5 text-sm text-texte"
            >
              <option value="">Europe (par défaut)</option>
              {ZONES_GEO.map((zone) => (
                <option key={zone} value={zone}>
                  {zone}
                </option>
              ))}
            </select>
          </label>
        )}
        {TYPES_PATRIMOINE.has(form.type_actif) && (
          <label className="flex flex-col gap-1 text-xs font-medium text-texte-attenue">
            Date d'acquisition
            <input
              value={form.date_acquisition}
              onChange={(e) => setForm({ ...form, date_acquisition: e.target.value })}
              type="date"
              className="rounded-md border border-bordure bg-surface px-2 py-1.5 text-sm text-texte"
            />
          </label>
        )}
        {/* Désactivé tant que les deux champs obligatoires ne sont pas remplis
            (recette du 02/09/2026) : `handleAdd` retournait silencieusement, donc un
            clic sur « Ajouter » avec un formulaire vide ne produisait AUCUN retour —
            l'utilisateur ne savait pas ce qu'on attendait de lui. Le `title` dit
            quoi remplir plutôt que de laisser deviner. */}
        <button
          type="submit"
          disabled={saving || !form.ticker.trim() || !form.quantite}
          title={!form.ticker.trim() || !form.quantite ? 'Renseignez au minimum un ticker et une quantité.' : undefined}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-surface disabled:opacity-40"
        >
          Ajouter
        </button>
      </form>
      <p className="mt-3 text-xs text-texte-attenue">
        Pour l'immobilier, une SCPI, une assurance-vie, un PER, un compte courant/d'épargne ou un véhicule : laisser
        Quantité à 1 et renseigner Valeur estimée — elle remplace le calcul prix × quantité et se met à jour à la main,
        périodiquement.
      </p>
      {TYPES_AVEC_TAUX.has(form.type_actif) &&
        valeurProjeteeUnAn(form.valeur_estimee ? Number(form.valeur_estimee) : null, form.taux_pct ? Number(form.taux_pct) : null) !==
          null && (
          <p className="mt-1 text-xs text-texte-attenue">
            Valeur projetée dans 1 an (indicatif, jamais appliqué automatiquement) :{' '}
            {valeurProjeteeUnAn(Number(form.valeur_estimee), Number(form.taux_pct))?.toLocaleString('fr-FR', {
              style: 'currency',
              currency: 'EUR',
              maximumFractionDigits: 0,
            })}
          </p>
        )}
      {error && <EtatErreur message={error} />}
    </Card>
  )
}
