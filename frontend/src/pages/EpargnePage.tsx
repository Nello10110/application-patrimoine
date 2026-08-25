import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import type { Holding, ValuationHistoryPoint } from '../api/types'
import { AjoutValorisationForm, ValorisationHistoriqueCard } from '../components/HoldingDetailContent'
import Card from '../components/Card'
import EtatErreur from '../components/EtatErreur'
import EtatVide from '../components/EtatVide'
import { SkeletonTexte } from '../components/Skeleton'
import { usePreferencesAffichage } from '../hooks/usePreferencesAffichage'
import { TYPE_ACTIF_OPTIONS, TYPES_EPARGNE } from '../utils/holdingCategories'
import { formatDate, formatEuro } from '../utils/format'

const OPTIONS_EPARGNE = TYPE_ACTIF_OPTIONS.filter((o) => TYPES_EPARGNE.has(o.value))

function libelleType(typeActif: string | null): string {
  return OPTIONS_EPARGNE.find((o) => o.value === typeActif)?.label ?? (typeActif ?? '—')
}

type FormulaireCompte = {
  nom: string
  type_actif: string
  valeur_estimee: string
  versement_mensuel: string
}

function formulaireVierge(): FormulaireCompte {
  return { nom: '', type_actif: OPTIONS_EPARGNE[0]?.value ?? '', valeur_estimee: '', versement_mensuel: '' }
}

/** Une carte "compte" (backlog 2.S.1) : valeur actuelle, versement mensuel déclaré,
 * historique daté et ajout rapide d'un point — gère son propre historique (requête
 * indépendante par compte, comme `DetenteursSection`/`useImmobilierDetail` pour la
 * fiche détaillée), pour ne pas coupler le chargement de tous les comptes entre eux. */
function CompteEpargneCard({ holding, onChanged }: { holding: Holding; onChanged: () => void }) {
  const { montantsMasques } = usePreferencesAffichage()
  const [historique, setHistorique] = useState<ValuationHistoryPoint[]>([])
  const [ouvert, setOuvert] = useState(false)
  const [valeurActuelle, setValeurActuelle] = useState(holding.valeur_estimee)
  const [dateValeurActuelle, setDateValeurActuelle] = useState(holding.date_valeur_estimee)

  function rechargerHistorique() {
    api
      .getHoldingValuationHistory(holding.ticker)
      .then(setHistorique)
      .catch(() => setHistorique([]))
  }

  useEffect(rechargerHistorique, [holding.ticker])

  function handleValorisationAjoutee(h: Holding) {
    setValeurActuelle(h.valeur_estimee)
    setDateValeurActuelle(h.date_valeur_estimee)
    rechargerHistorique()
    onChanged()
  }

  return (
    <Card>
      <div className="flex items-start justify-between gap-2">
        <div>
          <Link to={`/patrimoine/${encodeURIComponent(holding.ticker)}`} className="text-sm font-medium text-texte hover:underline">
            {holding.nom ?? holding.ticker}
          </Link>
          <p className="text-xs text-texte-attenue">{libelleType(holding.type_actif)}</p>
        </div>
        <button type="button" onClick={() => setOuvert((v) => !v)} className="text-sm font-medium text-accent hover:underline">
          {ouvert ? 'Fermer' : 'Ajouter une valorisation'}
        </button>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div>
          <p className="text-xs text-texte-attenue">Valeur actuelle</p>
          <p className="font-medium text-texte">{formatEuro(valeurActuelle, 2, montantsMasques)}</p>
          {dateValeurActuelle && <p className="text-xs text-texte-attenue">au {formatDate(dateValeurActuelle)}</p>}
        </div>
        <div>
          <p className="text-xs text-texte-attenue">Versement mensuel</p>
          <p className="font-medium text-texte">
            {holding.versement_mensuel !== null ? formatEuro(holding.versement_mensuel, 2, montantsMasques) : '—'}
          </p>
        </div>
      </div>

      {ouvert && (
        <div className="mt-4 border-t border-bordure pt-4">
          <AjoutValorisationForm ticker={holding.ticker} onAdded={handleValorisationAjoutee} />
        </div>
      )}

      <div className="mt-4">
        <ValorisationHistoriqueCard historique={historique} />
      </div>
    </Card>
  )
}

/** Formulaire de création d'un compte Épargne (backlog 2.S.1) — réutilise
 * `api.createHolding`, quantité fixée à 1 comme pour l'immobilier/assurance-vie
 * (convention déjà en vigueur, cf. la note sous le formulaire de Portefeuille). */
function AjoutCompteForm({ onCreated }: { onCreated: () => void }) {
  const [form, setForm] = useState<FormulaireCompte>(formulaireVierge())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.nom.trim()) return
    setSaving(true)
    setError(null)
    try {
      await api.createHolding({
        ticker: form.nom.trim().toUpperCase().replace(/\s+/g, '_'),
        nom: form.nom.trim(),
        quantite: 1,
        type_actif: form.type_actif,
        valeur_estimee: form.valeur_estimee ? Number(form.valeur_estimee) : null,
        versement_mensuel: form.versement_mensuel ? Number(form.versement_mensuel) : null,
      })
      setForm(formulaireVierge())
      onCreated()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
      <label className="block">
        <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-texte-attenue">Nom du compte</span>
        <input
          type="text"
          required
          value={form.nom}
          onChange={(e) => setForm({ ...form, nom: e.target.value })}
          placeholder="ex. Assurance-vie Boursorama"
          className="w-full rounded-md border border-bordure bg-surface px-3 py-2 text-sm text-texte"
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-texte-attenue">Type</span>
        <select
          value={form.type_actif}
          onChange={(e) => setForm({ ...form, type_actif: e.target.value })}
          className="w-full rounded-md border border-bordure bg-surface px-3 py-2 text-sm text-texte"
        >
          {OPTIONS_EPARGNE.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-texte-attenue">Valeur initiale (€, optionnel)</span>
        <input
          type="number"
          step="any"
          min={0}
          value={form.valeur_estimee}
          onChange={(e) => setForm({ ...form, valeur_estimee: e.target.value })}
          className="w-full rounded-md border border-bordure bg-surface px-3 py-2 text-sm text-texte"
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-texte-attenue">
          Versement mensuel (€, optionnel)
        </span>
        <input
          type="number"
          step="any"
          min={0}
          value={form.versement_mensuel}
          onChange={(e) => setForm({ ...form, versement_mensuel: e.target.value })}
          className="w-full rounded-md border border-bordure bg-surface px-3 py-2 text-sm text-texte"
        />
      </label>
      <div className="sm:col-span-2">
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-surface disabled:opacity-60"
        >
          {saving ? 'Enregistrement…' : '+ Ajouter un compte'}
        </button>
        {error && <EtatErreur message={error} />}
      </div>
    </form>
  )
}

/** Écran Épargne (backlog 2.S.1) : assurance-vie, PER, épargne réglementée/salariale
 * et compte courant — valorisés à la date choisie par l'utilisateur plutôt qu'au
 * moment de la saisie, contrairement aux lignes boursières cotées automatiquement.
 * Le Véhicule en reste exclu (décote plutôt qu'épargne, futur rapprochement avec
 * l'immobilier) ; ces 5 types restent aussi visibles dans Portefeuille (onglet
 * "Immobilier & Épargne"), cet écran est un complément, pas un remplacement. */
export default function EpargnePage() {
  const [holdings, setHoldings] = useState<Holding[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [formulaireOuvert, setFormulaireOuvert] = useState(false)
  const { montantsMasques } = usePreferencesAffichage()

  function charger() {
    setError(null)
    api
      .listHoldings()
      .then(setHoldings)
      .catch((err) => setError(err.message))
  }

  useEffect(charger, [])

  if (error) return <EtatErreur message={error} onReessayer={charger} />
  if (!holdings) return <SkeletonTexte />

  const comptes = holdings.filter((h) => h.type_actif !== null && TYPES_EPARGNE.has(h.type_actif))
  const valeurTotale = comptes.reduce((somme, h) => somme + (h.valeur_estimee ?? 0), 0)
  const versementTotal = comptes.reduce((somme, h) => somme + (h.versement_mensuel ?? 0), 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xl font-semibold text-texte">Épargne</h2>
        {!formulaireOuvert && (
          <button
            type="button"
            onClick={() => setFormulaireOuvert(true)}
            className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-surface"
          >
            + Ajouter un compte
          </button>
        )}
      </div>

      <p className="text-sm text-texte-attenue">
        Assurance-vie, PER, épargne réglementée/salariale, compte courant — valorisés à la date de votre choix plutôt qu'en
        continu. Le Véhicule reste dans Portefeuille (onglet « Immobilier & Épargne »), pas ici.
      </p>

      {comptes.length > 0 && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-texte-attenue">Valeur totale</p>
            <p className="mt-1 text-lg font-semibold text-texte">{formatEuro(valeurTotale, 2, montantsMasques)}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-texte-attenue">Versement mensuel total</p>
            <p className="mt-1 text-lg font-semibold text-texte">{formatEuro(versementTotal, 2, montantsMasques)}</p>
            <p className="text-xs text-texte-attenue">additionné au préremplissage du Simulateur</p>
          </div>
        </div>
      )}

      {formulaireOuvert && (
        <Card title="Nouveau compte">
          <AjoutCompteForm
            onCreated={() => {
              setFormulaireOuvert(false)
              charger()
            }}
          />
        </Card>
      )}

      {comptes.length === 0 && !formulaireOuvert && (
        <EtatVide
          titre="Aucun compte Épargne enregistré."
          description="Ajoute une assurance-vie, un PER, un livret ou un compte courant avec le bouton ci-dessus."
        />
      )}

      <div className="space-y-4">
        {comptes.map((h) => (
          <CompteEpargneCard key={h.id} holding={h} onChanged={charger} />
        ))}
      </div>
    </div>
  )
}
