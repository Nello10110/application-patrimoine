import { useCallback, useEffect, useLayoutEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from '../api/client'
import type { Compte, Etablissement, Holding } from '../api/types'
import AjoutHoldingForm from '../components/AjoutHoldingForm'
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

/** Onglets de catégorie — factorisés (backlog 2.K.4) : rendus à l'identique dans la
 * barre desktop inline et dans la feuille glissante mobile, un seul état source
 * (`categorie`, porté par l'URL, cf. composant parent). */
function CategorieTabs({ categorie, setCategorie }: { categorie: Categorie; setCategorie: (c: Categorie) => void }) {
  return (
    <>
      {CATEGORY_TABS.map((tab) => (
        <button
          key={tab.key}
          onClick={() => setCategorie(tab.key)}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            categorie === tab.key ? 'bg-texte text-surface' : 'bg-surface text-texte-attenue hover:bg-surface-elevee'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </>
  )
}

/** Sélecteur de compte — factorisé (backlog 2.K.4), même raison que `CategorieTabs`.
 * Association implicite label/`<select>` par imbrication (pas de `id`/`htmlFor`
 * nécessaire) : sans risque de collision même si les deux instances (desktop +
 * feuille mobile) étaient montées en même temps. `pleineLargeur` étire le contrôle
 * dans la feuille mobile (empilée verticalement) plutôt que la largeur naturelle du
 * `<select>` en ligne desktop. */
function CompteSelect({
  holdings,
  filtreCompte,
  setFiltreCompte,
  pleineLargeur = false,
}: {
  holdings: Holding[]
  filtreCompte: string
  setFiltreCompte: (c: string) => void
  pleineLargeur?: boolean
}) {
  return (
    <label className={`flex items-center gap-2 text-xs font-medium text-texte-attenue ${pleineLargeur ? 'flex-col items-start' : ''}`}>
      Filtrer par compte
      <select
        value={filtreCompte}
        onChange={(e) => setFiltreCompte(e.target.value)}
        className={`rounded-md border border-bordure bg-surface px-2 py-1.5 text-sm text-texte ${pleineLargeur ? 'w-full' : ''}`}
      >
        <option value={FILTRE_TOUS_COMPTES}>Tous les comptes</option>
        {comptesDisponibles(holdings).map((compte) => (
          <option key={compte.id} value={compte.id}>
            {compte.nom}
          </option>
        ))}
        {holdings.some((h) => h.compte === null) && <option value={FILTRE_SANS_COMPTE}>Sans compte</option>}
      </select>
    </label>
  )
}

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

  // Un seul appel `setSearchParams` (backlog 2.K.5) : deux appels synchrones
  // successifs (`setCategorie` puis `setFiltreCompte`) partiraient chacun du même
  // `prev` non encore réévalué par un nouveau rendu, et le second écraserait l'effet
  // du premier — bug réel constaté sur le bouton "Réinitialiser les filtres".
  function reinitialiserFiltres() {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.delete('categorie')
      next.delete('compte')
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

  // Confirmation de suppression (LOT 6.3) : remplace le `confirm()` natif du
  // navigateur par une modale de l'application (cohérente visuellement, testable).
  // Ne mémorise que ce qui est nécessaire à l'affichage du message et à l'appel API,
  // pas la ligne entière.
  // Filtres dans une feuille glissante sur mobile (backlog 2.K.4, < 768 px) — même
  // état (catégorie/compte, portés par l'URL) que la version inline desktop, juste
  // un autre conteneur pour les mêmes contrôles.
  const [filtresOuverts, setFiltresOuverts] = useState(false)
  const filtreActif = categorie !== 'TOUS' || filtreCompte !== FILTRE_TOUS_COMPTES

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

  // Comptes chargés UNE fois pour toute la page, puis passés au formulaire d'ajout
  // et au tableau (backlog Z.1) : montés côte à côte, ils demandaient chacun leur
  // propre `GET /comptes`. Même raison pour les positions passées à `LoansCard`,
  // qui redemandait celles que cette page vient de charger.
  //
  // Volontairement PAS un cache de module : les deux composants rechargent la liste
  // après création d'un compte à la volée, et un cache mal invalidé les ferait
  // diverger — c'est précisément le risque qui avait fait écarter ce chantier.
  const [comptes, setComptes] = useState<Compte[]>([])
  const [etablissements, setEtablissements] = useState<Etablissement[]>([])

  const chargerComptes = useCallback(() => {
    api.listComptes().then(setComptes).catch(() => setComptes([]))
  }, [])

  useEffect(chargerComptes, [chargerComptes])
  // Chargés une fois pour toute la page (même raison que `comptes` ci-dessus) —
  // affichés uniquement quand un compte est créé à la volée (revue du 03/09/2026,
  // établissement obligatoire).
  useEffect(() => {
    api.listEtablissements().then(setEtablissements).catch(() => setEtablissements([]))
  }, [])

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

      {error && <EtatErreur message={error} onReessayer={load} />}
      {erreurRafraichissement && <EtatErreur message={erreurRafraichissement} />}

      <AjoutHoldingForm onCreated={load} comptes={comptes} etablissements={etablissements} onComptesModifies={chargerComptes} />

      {/* Desktop (≥ 768 px, backlog 2.K.4) : contrôles inline, comportement inchangé. */}
      <div className="hidden flex-wrap items-center justify-between gap-3 md:flex">
        <CategorieTabs categorie={categorie} setCategorie={setCategorie} />
        {holdings.length > 0 && (
          <CompteSelect holdings={holdings} filtreCompte={filtreCompte} setFiltreCompte={setFiltreCompte} />
        )}
      </div>

      {/* Mobile (< 768 px) : les mêmes contrôles derrière une feuille glissante,
          déclenchée par un bouton à cible tactile confortable (≥ 44 px). */}
      <div className="md:hidden">
        <button
          type="button"
          onClick={() => setFiltresOuverts(true)}
          className="flex min-h-11 w-full items-center justify-between rounded-md border border-bordure bg-surface px-4 py-2.5 text-sm font-medium text-texte"
        >
          <span>
            Filtrer{filtreActif && <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />}
          </span>
          <span className="text-texte-attenue">{CATEGORY_TABS.find((t) => t.key === categorie)?.label}</span>
        </button>
      </div>

      {filtresOuverts && (
        <Modale
          onClose={() => setFiltresOuverts(false)}
          variant="bottom"
          panelClassName="w-full rounded-t-2xl bg-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-xl"
        >
          {({ titleId }) => (
            <div className="space-y-4">
              <div className="mx-auto h-1 w-10 rounded-full bg-bordure" aria-hidden="true" />
              <h2 id={titleId} className="text-sm font-semibold text-texte">
                Filtrer le portefeuille
              </h2>
              <div className="flex flex-wrap gap-1.5">
                <CategorieTabs categorie={categorie} setCategorie={setCategorie} />
              </div>
              {holdings.length > 0 && (
                <CompteSelect holdings={holdings} filtreCompte={filtreCompte} setFiltreCompte={setFiltreCompte} pleineLargeur />
              )}
              <button
                type="button"
                onClick={() => setFiltresOuverts(false)}
                className="min-h-11 w-full rounded-md bg-accent px-4 py-2.5 text-sm font-medium text-surface"
              >
                Voir {lignesFiltrees.length} position{lignesFiltrees.length > 1 ? 's' : ''}
              </button>
            </div>
          )}
        </Modale>
      )}

      <Card>
        {loading ? (
          <SkeletonTexte lignes={5} />
        ) : holdings.length === 0 ? (
          <EtatVide titre="Aucune position. Ajoute une ligne ou importe un fichier." />
        ) : lignesFiltrees.length === 0 ? (
          <EtatVide
            titre="Aucune position ne correspond à ce filtre."
            description={
              <button type="button" onClick={reinitialiserFiltres} className="font-medium text-accent hover:underline">
                Réinitialiser les filtres
              </button>
            }
          />
        ) : (
          <PositionsTable
            rows={lignesFiltrees}
            onSelectTicker={setSelectedTicker}
            onRequestDelete={(h) => setConfirmSuppression({ id: h.id, ticker: h.ticker })}
            onSaved={load}
            comptes={comptes}
            etablissements={etablissements}
            onComptesModifies={chargerComptes}
          />
        )}
      </Card>

      <LoansCard holdings={holdings} etablissements={etablissements} />

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
