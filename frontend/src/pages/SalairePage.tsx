import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { SalaireDonnees, SalaireIn, SalaireResume } from '../api/types'
import Card from '../components/Card'
import EtatErreur from '../components/EtatErreur'
import EtatVide from '../components/EtatVide'
import { SkeletonTexte } from '../components/Skeleton'
import StatTile from '../components/StatTile'
import { usePreferencesAffichage } from '../hooks/usePreferencesAffichage'
import { estimerBrutNet } from '../utils/salaire'
import { formatEuro } from '../utils/format'

const ANNEE_COURANTE = new Date().getFullYear()

function formatPctPositif(value: number | null): string {
  return value === null ? '—' : `${value.toFixed(1)} %`
}

type Formulaire = {
  annee: number
  nom: string
  montant: string
  typeMontant: 'brut' | 'net'
  periodicite: 'mensuel' | 'annuel'
  statut: 'cadre' | 'non_cadre'
  nombreMois: number
  tauxImposition: string
}

function formulaireVierge(annee: number): Formulaire {
  return { annee, nom: '', montant: '', typeMontant: 'brut', periodicite: 'mensuel', statut: 'cadre', nombreMois: 12, tauxImposition: '' }
}

function formulaireDepuisEntree(entree: SalaireResume): Formulaire {
  return {
    annee: entree.annee,
    nom: entree.nom,
    montant: String(entree.montant),
    typeMontant: entree.type_montant,
    periodicite: entree.periodicite,
    statut: entree.statut,
    nombreMois: entree.nombre_mois,
    tauxImposition: entree.taux_imposition_pct === null ? '' : String(entree.taux_imposition_pct),
  }
}

export default function SalairePage() {
  const { montantsMasques } = usePreferencesAffichage()
  const [donnees, setDonnees] = useState<SalaireDonnees | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [annee, setAnnee] = useState(ANNEE_COURANTE)

  const [entreeEnEdition, setEntreeEnEdition] = useState<SalaireResume | null>(null)
  const [formulaireOuvert, setFormulaireOuvert] = useState(false)
  const [formulaire, setFormulaire] = useState<Formulaire>(formulaireVierge(ANNEE_COURANTE))
  const [sauvegarde, setSauvegarde] = useState(false)
  const [erreurSauvegarde, setErreurSauvegarde] = useState<string | null>(null)

  function charger() {
    setError(null)
    api.getSalaires().then(setDonnees).catch((err) => setError(err.message))
  }

  useEffect(charger, [])

  if (error) return <EtatErreur message={error} onReessayer={charger} />
  if (!donnees) return <SkeletonTexte />

  const anneesDisponibles = Array.from(new Set([...donnees.entrees.map((e) => e.annee), ANNEE_COURANTE])).sort((a, b) => b - a)
  const entreesAnnee = donnees.entrees.filter((e) => e.annee === annee)
  const syntheseAnnee = donnees.syntheses.find((s) => s.annee === annee) ?? null
  const valeursTauxEpargne = donnees.syntheses.map((s) => s.taux_epargne_pct).filter((v): v is number => v !== null)
  const moyenneTauxEpargne = valeursTauxEpargne.length > 0 ? valeursTauxEpargne.reduce((a, b) => a + b, 0) / valeursTauxEpargne.length : null

  const apercu = (() => {
    const montantNum = Number(formulaire.montant.replace(',', '.'))
    if (!montantNum || montantNum <= 0) return null
    const { brut, net } = estimerBrutNet(montantNum, formulaire.typeMontant, formulaire.statut)
    const facteur = formulaire.periodicite === 'mensuel' ? formulaire.nombreMois : 1
    const netAvantImpotAnnuel = net * facteur
    const taux = Number(formulaire.tauxImposition.replace(',', '.'))
    const netApresImpotAnnuel = formulaire.tauxImposition !== '' && !Number.isNaN(taux) ? netAvantImpotAnnuel * (1 - taux / 100) : null
    return { brutAnnuel: brut * facteur, netAvantImpotAnnuel, netApresImpotAnnuel }
  })()

  function ouvrirAjout() {
    setEntreeEnEdition(null)
    setFormulaire(formulaireVierge(annee))
    setErreurSauvegarde(null)
    setFormulaireOuvert(true)
  }

  function ouvrirEdition(entree: SalaireResume) {
    setEntreeEnEdition(entree)
    setFormulaire(formulaireDepuisEntree(entree))
    setErreurSauvegarde(null)
    setFormulaireOuvert(true)
  }

  function enregistrer() {
    const montantNum = Number(formulaire.montant.replace(',', '.'))
    if (!montantNum || montantNum <= 0) {
      setErreurSauvegarde('Le montant doit être strictement positif.')
      return
    }
    const tauxTexte = formulaire.tauxImposition.trim()
    const taux = tauxTexte === '' ? null : Number(tauxTexte.replace(',', '.'))
    if (taux !== null && (Number.isNaN(taux) || taux < 0 || taux > 100)) {
      setErreurSauvegarde("Le taux d'imposition doit être compris entre 0 et 100.")
      return
    }

    const payload: SalaireIn = {
      annee: formulaire.annee,
      nom: formulaire.nom.trim() || null,
      montant: montantNum,
      type_montant: formulaire.typeMontant,
      periodicite: formulaire.periodicite,
      statut: formulaire.statut,
      nombre_mois: formulaire.nombreMois,
      taux_imposition_pct: taux,
    }

    setSauvegarde(true)
    setErreurSauvegarde(null)
    const requete = entreeEnEdition ? api.updateSalaire(entreeEnEdition.id, payload) : api.createSalaire(payload)
    requete
      .then(() => {
        setFormulaireOuvert(false)
        setAnnee(formulaire.annee)
        charger()
      })
      .catch((err) => setErreurSauvegarde(err.message))
      .finally(() => setSauvegarde(false))
  }

  function supprimer(entree: SalaireResume) {
    api.deleteSalaire(entree.id).then(charger)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xl font-semibold text-texte">Salaire</h2>
        <select
          value={annee}
          onChange={(e) => setAnnee(Number(e.target.value))}
          className="rounded-md border border-bordure bg-surface px-2.5 py-1.5 text-sm text-texte"
        >
          {anneesDisponibles.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      </div>

      <Card
        title={`Salaires — ${annee}`}
        headerActions={
          !formulaireOuvert && (
            <button type="button" onClick={ouvrirAjout} className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-surface">
              + Ajouter un salaire
            </button>
          )
        }
      >
        {entreesAnnee.length === 0 && !formulaireOuvert && (
          <EtatVide
            titre="Aucun salaire enregistré pour cette année."
            description="Ajoute un salaire (un par revenu, ex. un par conjoint) avec le bouton ci-dessus."
          />
        )}

        {entreesAnnee.length > 0 && (
          <div className="space-y-3">
            {entreesAnnee.map((entree) => (
              <div key={entree.id} className="rounded-lg border border-bordure p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-texte">{entree.nom}</p>
                    <p className="text-xs text-texte-attenue">
                      {entree.statut === 'cadre' ? 'Cadre' : 'Non-cadre'} · {entree.nombre_mois} versements/an ·{' '}
                      {entree.taux_imposition_pct === null ? "taux d'imposition non renseigné" : `taux d'imposition ${entree.taux_imposition_pct} %`}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button type="button" onClick={() => ouvrirEdition(entree)} className="text-sm font-medium text-accent hover:underline">
                      Modifier
                    </button>
                    <button type="button" onClick={() => supprimer(entree)} className="text-sm font-medium text-negatif hover:underline">
                      Supprimer
                    </button>
                  </div>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-texte-attenue">Brut annuel</p>
                    <p className="font-medium text-texte">{formatEuro(entree.brut_annuel, 0, montantsMasques)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-texte-attenue">Net avant impôt</p>
                    <p className="font-medium text-texte">{formatEuro(entree.net_avant_impot_annuel, 0, montantsMasques)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-texte-attenue">Net après impôt</p>
                    <p className="font-medium text-texte">{formatEuro(entree.net_apres_impot_annuel, 0, montantsMasques)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {formulaireOuvert && (
          <div className={`rounded-lg border border-bordure p-4 ${entreesAnnee.length > 0 ? 'mt-3' : ''}`}>
            <p className="mb-3 text-sm font-medium text-texte">{entreeEnEdition ? 'Modifier ce salaire' : 'Nouveau salaire'}</p>
            <p className="mb-4 text-sm text-texte-attenue">
              Conversion brut/net approximative (cotisations salariales forfaitaires selon le statut) — pas un bulletin
              de paie certifié.
            </p>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-texte-attenue">
                  Nom (optionnel)
                </span>
                <input
                  type="text"
                  value={formulaire.nom}
                  onChange={(e) => setFormulaire({ ...formulaire, nom: e.target.value })}
                  placeholder="ex. Salaire de Paul"
                  className="w-full rounded-md border border-bordure bg-surface px-3 py-2 text-sm text-texte"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-texte-attenue">Année</span>
                <input
                  type="number"
                  value={formulaire.annee}
                  onChange={(e) => setFormulaire({ ...formulaire, annee: Number(e.target.value) || ANNEE_COURANTE })}
                  className="w-full rounded-md border border-bordure bg-surface px-3 py-2 text-sm text-texte"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-texte-attenue">Montant</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={formulaire.montant}
                  onChange={(e) => setFormulaire({ ...formulaire, montant: e.target.value })}
                  placeholder="ex. 2500"
                  className="w-full rounded-md border border-bordure bg-surface px-3 py-2 text-sm text-texte"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-texte-attenue">
                  Nombre de versements par an
                </span>
                <input
                  type="number"
                  min={1}
                  max={24}
                  value={formulaire.nombreMois}
                  onChange={(e) => setFormulaire({ ...formulaire, nombreMois: Number(e.target.value) || 12 })}
                  className="w-full rounded-md border border-bordure bg-surface px-3 py-2 text-sm text-texte"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-texte-attenue">
                  Taux d'imposition de cette entrée (optionnel)
                </span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={formulaire.tauxImposition}
                  onChange={(e) => setFormulaire({ ...formulaire, tauxImposition: e.target.value })}
                  placeholder="ex. 11"
                  className="w-full rounded-md border border-bordure bg-surface px-3 py-2 text-sm text-texte"
                />
              </label>
            </div>

            <div className="mt-4 flex flex-wrap gap-4">
              <div className="flex gap-0.5 rounded-md bg-surface-elevee p-0.5">
                {(['brut', 'net'] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setFormulaire({ ...formulaire, typeMontant: v })}
                    aria-pressed={formulaire.typeMontant === v}
                    className={`rounded px-2.5 py-1 text-sm font-medium capitalize transition-colors ${
                      formulaire.typeMontant === v ? 'bg-texte text-surface' : 'text-texte-attenue hover:text-texte'
                    }`}
                  >
                    {v}
                  </button>
                ))}
              </div>

              <div className="flex gap-0.5 rounded-md bg-surface-elevee p-0.5">
                {(['mensuel', 'annuel'] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setFormulaire({ ...formulaire, periodicite: v })}
                    aria-pressed={formulaire.periodicite === v}
                    className={`rounded px-2.5 py-1 text-sm font-medium capitalize transition-colors ${
                      formulaire.periodicite === v ? 'bg-texte text-surface' : 'text-texte-attenue hover:text-texte'
                    }`}
                  >
                    {v}
                  </button>
                ))}
              </div>

              <div className="flex gap-0.5 rounded-md bg-surface-elevee p-0.5">
                {(['cadre', 'non_cadre'] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setFormulaire({ ...formulaire, statut: v })}
                    aria-pressed={formulaire.statut === v}
                    className={`rounded px-2.5 py-1 text-sm font-medium transition-colors ${
                      formulaire.statut === v ? 'bg-texte text-surface' : 'text-texte-attenue hover:text-texte'
                    }`}
                  >
                    {v === 'cadre' ? 'Cadre' : 'Non-cadre'}
                  </button>
                ))}
              </div>
            </div>

            {apercu && (
              <p className="mt-4 text-sm text-texte-attenue">
                Aperçu : {formatEuro(apercu.brutAnnuel, 0, montantsMasques)} brut/an ·{' '}
                {formatEuro(apercu.netAvantImpotAnnuel, 0, montantsMasques)} net avant impôt/an
                {apercu.netApresImpotAnnuel !== null && (
                  <> · {formatEuro(apercu.netApresImpotAnnuel, 0, montantsMasques)} net après impôt/an</>
                )}
              </p>
            )}

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={enregistrer}
                disabled={sauvegarde}
                className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-surface disabled:opacity-60"
              >
                {sauvegarde ? 'Enregistrement…' : entreeEnEdition ? 'Enregistrer les modifications' : 'Ajouter ce salaire'}
              </button>
              <button
                type="button"
                onClick={() => setFormulaireOuvert(false)}
                className="rounded-md px-4 py-2 text-sm font-medium text-texte-attenue hover:text-texte"
              >
                Annuler
              </button>
            </div>
            {erreurSauvegarde && <EtatErreur message={erreurSauvegarde} />}
          </div>
        )}
      </Card>

      <Card title="Taux d'épargne du foyer">
        {donnees.syntheses.length === 0 ? (
          <EtatVide
            titre="Aucun salaire enregistré pour l'instant."
            description="Ajoute au moins un salaire ci-dessus pour voir apparaître le taux d'épargne du foyer."
          />
        ) : (
          <div className="space-y-4">
            {syntheseAnnee && syntheseAnnee.nombre_salaires > 0 && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-texte-attenue">{annee}</p>
                <p className="mt-1 text-3xl font-semibold text-texte">{formatPctPositif(syntheseAnnee.taux_epargne_pct)}</p>
                <p className="mt-1 text-xs text-texte-attenue">
                  {formatEuro(syntheseAnnee.montant_investi_annee, 0, montantsMasques)} investis en achats réels sur
                  l'année, rapportés au revenu net total du foyer ({syntheseAnnee.nombre_salaires} salaire
                  {syntheseAnnee.nombre_salaires > 1 ? 's' : ''}
                  {!syntheseAnnee.toutes_les_entrees_ont_un_taux_imposition && ", au moins un sans taux d'imposition renseigné (net avant impôt utilisé pour celui-ci)"}
                  ). Distinct du rendement du portefeuille (performance de marché sur ce qui est déjà investi).
                </p>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <StatTile label="Revenu net total" value={formatEuro(syntheseAnnee.net_total_annuel, 0, montantsMasques)} />
                  <StatTile label="Investi cette année" value={formatEuro(syntheseAnnee.montant_investi_annee, 0, montantsMasques)} />
                </div>
              </div>
            )}

            {moyenneTauxEpargne !== null && (
              <p className="text-sm text-texte-attenue">
                Moyenne sur {valeursTauxEpargne.length} année(s) : <span className="font-medium text-texte">{formatPctPositif(moyenneTauxEpargne)}</span>
              </p>
            )}

            <table className="w-full text-sm">
              <tbody>
                {[...donnees.syntheses]
                  .sort((a, b) => b.annee - a.annee)
                  .map((s) => (
                    <tr key={s.annee} className="border-b border-bordure last:border-0">
                      <td className="py-2 text-texte-attenue">
                        {s.annee} <span className="text-xs">({s.nombre_salaires} salaire{s.nombre_salaires > 1 ? 's' : ''})</span>
                      </td>
                      <td className="py-2 text-right font-medium text-texte">{formatPctPositif(s.taux_epargne_pct)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
