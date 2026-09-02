import { useRef, useState } from 'react'
import { api } from '../api/client'
import type { ApercuImportDonnees } from '../api/types'
import Card from './Card'
import EtatErreur from './EtatErreur'
import Modale from './Modale'

/** Libellés lisibles des tables du fichier d'export — le décompte brut
 * (`holding_valuation_history: 12`) ne dit rien à un utilisateur. Une table absente
 * de cette table de correspondance s'affiche sous son nom technique plutôt que
 * d'être masquée : mieux vaut un libellé imparfait qu'un contenu invisible. */
const LIBELLES: Record<string, string> = {
  etablissements: 'établissements',
  comptes: 'comptes',
  detenteurs: 'détenteurs (personnes/sociétés)',
  holdings: 'lignes de patrimoine',
  holding_immobilier_details: 'fiches immobilier',
  holding_valuation_history: 'points de valorisation',
  quotites_holdings: 'répartitions entre détenteurs',
  loans: 'emprunts',
  quotites_loans: "répartitions d'emprunt",
  transactions: 'transactions',
  salaires: 'salaires',
  objectifs: 'objectifs',
  objectif_actifs: "actifs rattachés à un objectif",
  objectif_contributeurs: 'contributeurs à un objectif',
  categories_budget: 'catégories de budget',
  mouvements_bancaires: 'mouvements bancaires',
  regles_categorisation: 'règles de catégorisation',
  budget_cibles: 'budgets cibles',
  user_parametres: 'préférences',
}

function libelle(table: string): string {
  return LIBELLES[table] ?? table
}

/** Sauvegarde complète : export JSON de tout le patrimoine du foyer, et import
 * qui le REMPLACE intégralement (backlog X.6).
 *
 * Parcours d'import en deux temps, délibérément : le fichier est d'abord analysé
 * côté serveur (`/import/apercu`, qui ne modifie rien) pour afficher son contenu,
 * PUIS seulement l'utilisateur confirme. Un import est irréversible et efface
 * l'existant — le laisser se déclencher au simple choix d'un fichier serait une
 * faute d'ergonomie sur une action de cette portée. */
export default function SauvegardeDonneesCard() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [fichier, setFichier] = useState<File | null>(null)
  const [apercu, setApercu] = useState<ApercuImportDonnees | null>(null)
  const [analyse, setAnalyse] = useState(false)
  const [importEnCours, setImportEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [succes, setSucces] = useState<string | null>(null)

  /** Remet le choix de fichier à zéro (ferme la confirmation, vide le champ) SANS
   * toucher au message d'erreur : cette fonction est appelée depuis les `catch`,
   * juste après `setErreur(...)` — y remettre l'erreur à `null` effacerait le
   * message avant même qu'il ne s'affiche. Chaque action repart d'un état propre
   * en appelant `setErreur(null)` de son côté. */
  function reinitialiser() {
    setFichier(null)
    setApercu(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  async function handleExport() {
    setErreur(null)
    setSucces(null)
    try {
      const blob = await api.downloadExportDonnees()
      // Téléchargement piloté côté client (plutôt qu'un simple `<a href>`) : la
      // route exige l'en-tête d'authentification, qu'une navigation directe du
      // navigateur ne porterait pas — même raison que la déclaration PDF.
      const url = URL.createObjectURL(blob)
      const lien = document.createElement('a')
      lien.href = url
      lien.download = `patrimoine-export-${new Date().toISOString().slice(0, 10)}.json`
      lien.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setErreur((err as Error).message)
    }
  }

  async function handleFichierChoisi(e: React.ChangeEvent<HTMLInputElement>) {
    const choisi = e.target.files?.[0]
    if (!choisi) return
    setErreur(null)
    setSucces(null)
    setFichier(choisi)
    setAnalyse(true)
    try {
      setApercu(await api.apercuImportDonnees(choisi))
    } catch (err) {
      setErreur((err as Error).message)
      reinitialiser()
    } finally {
      setAnalyse(false)
    }
  }

  async function confirmerImport() {
    if (!fichier) return
    setImportEnCours(true)
    setErreur(null)
    try {
      const resultat = await api.importerDonnees(fichier)
      const total = Object.values(resultat.contenu).reduce((somme, n) => somme + n, 0)
      setSucces(`Import terminé : ${total} enregistrement${total > 1 ? 's' : ''} restauré${total > 1 ? 's' : ''}.`)
      reinitialiser()
    } catch (err) {
      setErreur((err as Error).message)
      reinitialiser()
    } finally {
      setImportEnCours(false)
    }
  }

  return (
    <Card title="Sauvegarde complète des données">
      <p className="mb-4 text-sm text-texte">
        Exporte <span className="font-medium text-texte">tout</span> le patrimoine du foyer dans un seul fichier :
        positions, transactions, immobilier, emprunts, comptes et établissements, détenteurs et répartitions, épargne,
        objectifs, salaires, budget et préférences. Utile pour se faire une sauvegarde avant une manipulation, ou pour
        déménager vers une autre installation.
      </p>
      <p className="mb-4 text-sm text-texte-attenue">
        Les cours et compositions de fonds ne sont pas inclus : ils se retéléchargent seuls. Rien de sensible non plus
        (mots de passe, jetons de partage, journal d'accès). Le fichier contient en revanche tous vos montants —
        conservez-le comme un document confidentiel.
      </p>

      <button
        type="button"
        onClick={handleExport}
        className="rounded-md bg-texte px-4 py-2 text-sm font-medium text-surface"
      >
        Exporter mes données (JSON)
      </button>

      <div className="mt-6 border-t border-bordure pt-4">
        <p className="mb-1 text-sm font-medium text-texte">Restaurer depuis un fichier</p>
        <p className="mb-3 text-sm text-texte-attenue">
          L'import <span className="font-medium text-negatif">remplace intégralement</span> les données actuelles du
          foyer par celles du fichier. Le contenu du fichier vous est présenté avant toute modification.
        </p>
        <input
          ref={inputRef}
          type="file"
          accept=".json,application/json"
          onChange={handleFichierChoisi}
          aria-label="Fichier de sauvegarde à restaurer"
          className="block w-full text-sm text-texte file:mr-3 file:rounded-md file:border-0 file:bg-surface-elevee file:px-4 file:py-2 file:text-sm file:font-medium file:text-texte"
        />
        {analyse && <p className="mt-2 text-sm text-texte-attenue">Analyse du fichier…</p>}
      </div>

      {succes && <p className="mt-3 text-sm text-positif">{succes}</p>}
      {erreur && <EtatErreur message={erreur} />}

      {apercu && fichier && (
        <Modale onClose={reinitialiser} panelClassName="w-full max-w-md rounded-xl bg-surface p-6 shadow-xl">
          {({ titleId }) => (
            <>
              <h2 id={titleId} className="text-lg font-semibold text-texte">
                Remplacer toutes vos données ?
              </h2>
              <p className="mt-2 text-sm text-texte">
                Le fichier <span className="font-medium text-texte">{fichier.name}</span>
                {apercu.exporte_le && <> (exporté le {new Date(apercu.exporte_le).toLocaleDateString('fr-FR')})</>} contient :
              </p>
              <ul className="mt-3 max-h-48 space-y-1 overflow-y-auto text-sm text-texte">
                {Object.entries(apercu.contenu).map(([table, nombre]) => (
                  <li key={table} className="flex justify-between gap-4">
                    <span className="text-texte-attenue">{libelle(table)}</span>
                    <span className="font-medium tabular-nums">{nombre}</span>
                  </li>
                ))}
                {Object.keys(apercu.contenu).length === 0 && <li className="text-texte-attenue">Aucune donnée.</li>}
              </ul>
              <p className="mt-3 text-sm text-negatif">
                Tout le patrimoine actuellement enregistré sera effacé et remplacé par ce contenu. Cette action est
                irréversible.
              </p>
              <div className="mt-5 flex justify-end gap-2">
                <button
                  onClick={reinitialiser}
                  disabled={importEnCours}
                  className="rounded-md px-4 py-2 text-sm font-medium text-texte-attenue hover:bg-surface-elevee disabled:opacity-40"
                >
                  Annuler
                </button>
                <button
                  onClick={confirmerImport}
                  disabled={importEnCours}
                  className="rounded-md bg-negatif px-4 py-2 text-sm font-medium text-surface hover:opacity-90 disabled:opacity-40"
                >
                  {importEnCours ? 'Import en cours…' : 'Remplacer mes données'}
                </button>
              </div>
            </>
          )}
        </Modale>
      )}
    </Card>
  )
}
