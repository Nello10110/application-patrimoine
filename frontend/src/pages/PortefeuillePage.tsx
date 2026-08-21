import { useEffect, useLayoutEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from '../api/client'
import type { Holding } from '../api/types'
import Card from '../components/Card'
import EtatErreur from '../components/EtatErreur'
import EtatVide from '../components/EtatVide'
import HoldingDetailModal from '../components/HoldingDetailModal'
import LoansCard from '../components/LoansCard'
import Modale from '../components/Modale'
import PositionsTable from '../components/PositionsTable'
import { SkeletonTexte } from '../components/Skeleton'
import { useRafraichissementCours } from '../hooks/useRafraichissementCours'
import {
  CATEGORY_TABS,
  type Categorie,
  FILTRE_SANS_COMPTE,
  FILTRE_TOUS_COMPTES,
  SEUIL_PEREMPTION_HEURES,
  TYPE_ACTIF_OPTIONS,
  categorieDe,
  comptesDisponibles,
  correspondAuFiltreCompte,
  coursLePlusAncien,
} from '../utils/holdingCategories'
import { formatDateHeure, parseDateApi } from '../utils/format'

// Position de défilement de la page (backlog 2.K.2), restituée au remontage
// (ex. retour depuis la fiche détaillée en pleine page) — comme le tri de
// `PositionsTable`, un état de la session en cours, pas une préférence durable.
const CLE_DEFILEMENT = 'patrimoine:portefeuille-defilement'

export default function PortefeuillePage() {
  const [holdings, setHoldings] = useState<Holding[]>([])
  // Catégorie et compte sont des FILTRES (ils changent ce qui est affiché), donc
  // portés par l'URL (backlog 2.K.2) plutôt qu'un état local : le retour
  // navigateur/`navigate(-1)` restitue automatiquement l'URL précédente, sans code
  // de restitution dédié. Clé omise de l'URL quand elle vaut sa valeur par défaut,
  // pour garder les URL propres par défaut.
  const [searchParams, setSearchParams] = useSearchParams()
  const categorie = (searchParams.get('categorie') as Categorie | null) ?? 'TOUS'
  const filtreCompte = searchParams.get('compte') ?? FILTRE_TOUS_COMPTES

  function setCategorie(suivante: Categorie) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (suivante === 'TOUS') next.delete('categorie')
      else next.set('categorie', suivante)
      return next
    })
  }

  function setFiltreCompte(suivant: string) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (suivant === FILTRE_TOUS_COMPTES) next.delete('compte')
      else next.set('compte', suivant)
      return next
    })
  }

  const [selectedTicker, setSelectedTicker] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Restitue le défilement enregistré au démontage précédent (ex. retour depuis la
  // fiche pleine page) ; `useLayoutEffect` pour restituer avant la première
  // peinture visible, sans clignotement au scroll 0. Le conteneur qui défile
  // réellement est `<main>` (`App.tsx` : `h-screen overflow-hidden` + `<main
  // className="overflow-y-auto">`), pas `window` — l'application ne fait jamais
  // défiler la fenêtre elle-même.
  useLayoutEffect(() => {
    const conteneur = document.querySelector('main')
    if (!conteneur) return
    const enregistre = window.sessionStorage.getItem(CLE_DEFILEMENT)
    if (enregistre) conteneur.scrollTop = Number(enregistre)
    return () => {
      window.sessionStorage.setItem(CLE_DEFILEMENT, String(conteneur.scrollTop))
    }
  }, [])

  const [form, setForm] = useState({ ticker: '', quantite: '', prix_revient_moyen: '', compte: '', type_actif: '', valeur_estimee: '' })
  const [saving, setSaving] = useState(false)

  // Confirmation de suppression (LOT 6.3) : remplace le `confirm()` natif du
  // navigateur par une modale de l'application (cohérente visuellement, testable).
  // Ne mémorise que ce qui est nécessaire à l'affichage du message et à l'appel API,
  // pas la ligne entière.
  const [confirmSuppression, setConfirmSuppression] = useState<{ id: number; ticker: string } | null>(null)
  const [suppressionEnCours, setSuppressionEnCours] = useState(false)

  function load() {
    setLoading(true)
    api
      .listHoldings()
      .then(setHoldings)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  // Rafraîchissement des cours en tâche de fond (LOT 4B) : recharge les positions
  // une fois le rafraîchissement terminé (succès ou échec), pour afficher les
  // cours à jour sans attendre une action supplémentaire de l'utilisateur.
  const { etat: etatRafraichissement, enCours: refreshing, erreur: erreurRafraichissement, declencher } =
    useRafraichissementCours(() => load())

  function handleRefresh() {
    declencher(() => api.refreshMarketData())
  }

  async function confirmerSuppression() {
    if (!confirmSuppression) return
    setSuppressionEnCours(true)
    try {
      await api.deleteHolding(confirmSuppression.id)
      setConfirmSuppression(null)
      load()
    } catch (err) {
      setError((err as Error).message)
      setConfirmSuppression(null)
    } finally {
      setSuppressionEnCours(false)
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!form.ticker.trim() || !form.quantite) return
    setSaving(true)
    setError(null)
    try {
      await api.createHolding({
        ticker: form.ticker.trim().toUpperCase(),
        quantite: Number(form.quantite),
        prix_revient_moyen: form.prix_revient_moyen ? Number(form.prix_revient_moyen) : null,
        compte: form.compte.trim() || null,
        type_actif: form.type_actif || null,
        valeur_estimee: form.valeur_estimee ? Number(form.valeur_estimee) : null,
      })
      setForm({ ticker: '', quantite: '', prix_revient_moyen: '', compte: '', type_actif: '', valeur_estimee: '' })
      load()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const libelleRafraichissement =
    etatRafraichissement?.en_cours && etatRafraichissement.positions_total > 0
      ? `Rafraîchissement... (${etatRafraichissement.positions_traitees} / ${etatRafraichissement.positions_total} positions)`
      : 'Rafraîchissement...'

  const lignesFiltrees = holdings.filter(
    (h) => (categorie === 'TOUS' || categorieDe(h) === categorie) && correspondAuFiltreCompte(h, filtreCompte),
  )

  const dateCoursLePlusAncien = coursLePlusAncien(holdings)
  const coursPerimes = dateCoursLePlusAncien
    ? Date.now() - parseDateApi(dateCoursLePlusAncien).getTime() > SEUIL_PEREMPTION_HEURES * 60 * 60 * 1000
    : false

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-texte">Portefeuille</h2>
        <div className="flex items-center gap-3">
          {dateCoursLePlusAncien && (
            <span className={`text-xs ${coursPerimes ? 'text-avertissement' : 'text-texte-attenue'}`}>
              Cours à jour au {formatDateHeure(dateCoursLePlusAncien)}
            </span>
          )}
          <button
            onClick={handleRefresh}
            disabled={refreshing || holdings.length === 0}
            className="rounded-md bg-texte px-4 py-2 text-sm font-medium text-surface disabled:opacity-40"
          >
            {refreshing ? libelleRafraichissement : 'Rafraîchir les cours'}
          </button>
        </div>
      </div>

      {error && <EtatErreur message={error} />}
      {erreurRafraichissement && <EtatErreur message={erreurRafraichissement} />}

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
            Prix de revient
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
            <input
              value={form.compte}
              onChange={(e) => setForm({ ...form, compte: e.target.value })}
              className="w-32 rounded-md border border-bordure bg-surface px-2 py-1.5 text-sm text-texte"
              placeholder="PEA, CTO..."
            />
          </label>
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
            Valeur estimée
            <input
              value={form.valeur_estimee}
              onChange={(e) => setForm({ ...form, valeur_estimee: e.target.value })}
              type="number"
              step="any"
              className="w-32 rounded-md border border-bordure bg-surface px-2 py-1.5 text-sm text-texte"
              placeholder="optionnel"
            />
          </label>
          <button
            type="submit"
            disabled={saving}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-surface disabled:opacity-40"
          >
            Ajouter
          </button>
        </form>
        <p className="mt-3 text-xs text-texte-attenue">
          Pour l'immobilier, une SCPI, une assurance-vie ou un PER : laisser Quantité à 1 et renseigner Valeur estimée — elle
          remplace le calcul prix × quantité et se met à jour à la main, périodiquement.
        </p>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1">
          {CATEGORY_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setCategorie(tab.key)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                categorie === tab.key
                  ? 'bg-texte text-surface'
                  : 'bg-surface text-texte-attenue hover:bg-surface-elevee'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {holdings.length > 0 && (
          <label className="flex items-center gap-2 text-xs font-medium text-texte-attenue">
            Filtrer par compte
            <select
              value={filtreCompte}
              onChange={(e) => setFiltreCompte(e.target.value)}
              className="rounded-md border border-bordure bg-surface px-2 py-1.5 text-sm text-texte"
            >
              <option value={FILTRE_TOUS_COMPTES}>Tous les comptes</option>
              {comptesDisponibles(holdings).map((compte) => (
                <option key={compte} value={compte}>
                  {compte}
                </option>
              ))}
              {holdings.some((h) => h.compte === null) && <option value={FILTRE_SANS_COMPTE}>Sans compte</option>}
            </select>
          </label>
        )}
      </div>

      <Card>
        {loading ? (
          <SkeletonTexte lignes={5} />
        ) : holdings.length === 0 ? (
          <EtatVide titre="Aucune position. Ajoute une ligne ou importe un fichier." />
        ) : (
          <PositionsTable
            rows={lignesFiltrees}
            onSelectTicker={setSelectedTicker}
            onRequestDelete={(h) => setConfirmSuppression({ id: h.id, ticker: h.ticker })}
            onSaved={load}
          />
        )}
      </Card>

      <LoansCard />

      {selectedTicker && <HoldingDetailModal ticker={selectedTicker} onClose={() => setSelectedTicker(null)} />}

      {confirmSuppression && (
        <Modale onClose={() => setConfirmSuppression(null)} panelClassName="w-full max-w-sm rounded-xl bg-surface p-6 shadow-xl">
          {({ titleId }) => (
            <>
              <h2 id={titleId} className="text-lg font-semibold text-texte">
                Supprimer cette ligne ?
              </h2>
              <p className="mt-2 text-sm text-texte">
                La ligne <span className="font-medium text-texte">{confirmSuppression.ticker}</span> sera
                définitivement supprimée du portefeuille.
              </p>
              <div className="mt-5 flex justify-end gap-2">
                <button
                  onClick={() => setConfirmSuppression(null)}
                  disabled={suppressionEnCours}
                  className="rounded-md px-4 py-2 text-sm font-medium text-texte-attenue hover:bg-surface-elevee disabled:opacity-40"
                >
                  Annuler
                </button>
                <button
                  onClick={confirmerSuppression}
                  disabled={suppressionEnCours}
                  className="rounded-md bg-negatif px-4 py-2 text-sm font-medium text-surface hover:opacity-90 disabled:opacity-40"
                >
                  {suppressionEnCours ? 'Suppression...' : 'Supprimer'}
                </button>
              </div>
            </>
          )}
        </Modale>
      )}
    </div>
  )
}
