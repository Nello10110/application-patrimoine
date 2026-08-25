import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import type { Preferences, SalaireResume } from '../api/types'
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

export default function SalairePage() {
  const { montantsMasques } = usePreferencesAffichage()
  const [salaires, setSalaires] = useState<SalaireResume[] | null>(null)
  const [preferences, setPreferences] = useState<Preferences | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [annee, setAnnee] = useState(ANNEE_COURANTE)
  const [montant, setMontant] = useState('')
  const [typeMontant, setTypeMontant] = useState<'brut' | 'net'>('brut')
  const [periodicite, setPeriodicite] = useState<'mensuel' | 'annuel'>('mensuel')
  const [statut, setStatut] = useState<'cadre' | 'non_cadre'>('cadre')
  const [nombreMois, setNombreMois] = useState(12)

  const [sauvegarde, setSauvegarde] = useState(false)
  const [erreurSauvegarde, setErreurSauvegarde] = useState<string | null>(null)

  function charger() {
    setError(null)
    Promise.all([api.getSalaires(), api.getPreferences()])
      .then(([listeSalaires, prefs]) => {
        setSalaires(listeSalaires)
        setPreferences(prefs)
      })
      .catch((err) => setError(err.message))
  }

  useEffect(charger, [])

  // Préremplit le formulaire depuis la ligne déjà enregistrée pour l'année
  // sélectionnée, sinon repart d'une saisie vierge.
  useEffect(() => {
    if (!salaires) return
    const existante = salaires.find((s) => s.annee === annee)
    if (existante) {
      setMontant(String(existante.montant))
      setTypeMontant(existante.type_montant)
      setPeriodicite(existante.periodicite)
      setStatut(existante.statut)
      setNombreMois(existante.nombre_mois)
    } else {
      setMontant('')
      setTypeMontant('brut')
      setPeriodicite('mensuel')
      setStatut('cadre')
      setNombreMois(12)
    }
    setErreurSauvegarde(null)
  }, [annee, salaires])

  const apercu = useMemo(() => {
    const montantNum = Number(montant.replace(',', '.'))
    if (!montantNum || montantNum <= 0) return null
    const { brut, net } = estimerBrutNet(montantNum, typeMontant, statut)
    const facteur = periodicite === 'mensuel' ? nombreMois : 1
    return { brutAnnuel: brut * facteur, netAvantImpotAnnuel: net * facteur }
  }, [montant, typeMontant, statut, periodicite, nombreMois])

  const resultatEnregistre = salaires?.find((s) => s.annee === annee) ?? null

  function enregistrer() {
    const montantNum = Number(montant.replace(',', '.'))
    if (!montantNum || montantNum <= 0) {
      setErreurSauvegarde('Le montant doit être strictement positif.')
      return
    }
    setSauvegarde(true)
    setErreurSauvegarde(null)
    api
      .updateSalaire(annee, { montant: montantNum, type_montant: typeMontant, periodicite, statut, nombre_mois: nombreMois })
      .then((resume) => {
        setSalaires((prev) => {
          const sansAnnee = (prev ?? []).filter((s) => s.annee !== annee)
          return [...sansAnnee, resume].sort((a, b) => a.annee - b.annee)
        })
      })
      .catch((err) => setErreurSauvegarde(err.message))
      .finally(() => setSauvegarde(false))
  }

  if (error) return <EtatErreur message={error} onReessayer={charger} />
  if (!salaires || !preferences) return <SkeletonTexte />

  const anneesDisponibles = Array.from(new Set([...salaires.map((s) => s.annee), ANNEE_COURANTE])).sort((a, b) => b - a)
  const tauxImpositionRenseigne = preferences.taux_imposition_pct !== null
  const moyenneTauxEpargne = (() => {
    const valeurs = salaires.map((s) => s.taux_epargne_pct).filter((v): v is number => v !== null)
    if (valeurs.length === 0) return null
    return valeurs.reduce((a, b) => a + b, 0) / valeurs.length
  })()

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

      <Card title={`Calculateur brut / net — ${annee}`}>
        <p className="mb-4 text-sm text-texte-attenue">
          Estimation approximative (cotisations salariales forfaitaires selon le statut) — pas un bulletin de paie
          certifié.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-texte-attenue">Montant</span>
            <input
              type="text"
              inputMode="decimal"
              value={montant}
              onChange={(e) => setMontant(e.target.value)}
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
              value={nombreMois}
              onChange={(e) => setNombreMois(Number(e.target.value) || 12)}
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
                onClick={() => setTypeMontant(v)}
                aria-pressed={typeMontant === v}
                className={`rounded px-2.5 py-1 text-sm font-medium capitalize transition-colors ${
                  typeMontant === v ? 'bg-texte text-surface' : 'text-texte-attenue hover:text-texte'
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
                onClick={() => setPeriodicite(v)}
                aria-pressed={periodicite === v}
                className={`rounded px-2.5 py-1 text-sm font-medium capitalize transition-colors ${
                  periodicite === v ? 'bg-texte text-surface' : 'text-texte-attenue hover:text-texte'
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
                onClick={() => setStatut(v)}
                aria-pressed={statut === v}
                className={`rounded px-2.5 py-1 text-sm font-medium transition-colors ${
                  statut === v ? 'bg-texte text-surface' : 'text-texte-attenue hover:text-texte'
                }`}
              >
                {v === 'cadre' ? 'Cadre' : 'Non-cadre'}
              </button>
            ))}
          </div>
        </div>

        {apercu && !resultatEnregistre && (
          <p className="mt-4 text-sm text-texte-attenue">
            Aperçu : {formatEuro(apercu.brutAnnuel, 0, montantsMasques)} brut/an ·{' '}
            {formatEuro(apercu.netAvantImpotAnnuel, 0, montantsMasques)} net avant impôt/an
          </p>
        )}

        <button
          type="button"
          onClick={enregistrer}
          disabled={sauvegarde}
          className="mt-4 rounded-md bg-accent px-4 py-2 text-sm font-medium text-surface disabled:opacity-60"
        >
          {sauvegarde ? 'Enregistrement…' : `Enregistrer pour ${annee}`}
        </button>
        {erreurSauvegarde && <EtatErreur message={erreurSauvegarde} />}

        {!tauxImpositionRenseigne && (
          <p className="mt-3 text-sm text-texte-attenue">
            Renseigne ton taux d'imposition dans{' '}
            <Link to="/reglages" className="font-medium text-accent hover:underline">
              Réglages
            </Link>{' '}
            pour voir le net après impôt et un taux d'épargne plus précis.
          </p>
        )}
      </Card>

      {resultatEnregistre && (
        <Card title={`Détail enregistré — ${annee}`}>
          <div className="grid gap-3 sm:grid-cols-3">
            <StatTile label="Brut annuel" value={formatEuro(resultatEnregistre.brut_annuel, 0, montantsMasques)} />
            <StatTile
              label="Net avant impôt annuel"
              value={formatEuro(resultatEnregistre.net_avant_impot_annuel, 0, montantsMasques)}
            />
            <StatTile
              label="Net après impôt annuel"
              value={formatEuro(resultatEnregistre.net_apres_impot_annuel, 0, montantsMasques)}
            />
            <StatTile
              label="Brut par versement"
              value={formatEuro(resultatEnregistre.brut_par_versement, 0, montantsMasques)}
              sub={`sur ${resultatEnregistre.nombre_mois} versements`}
            />
            <StatTile
              label="Net avant impôt / mois"
              value={formatEuro(resultatEnregistre.net_avant_impot_mensuel_moyen, 0, montantsMasques)}
              sub="moyenne sur 12 mois"
            />
            <StatTile
              label="Net après impôt / mois"
              value={formatEuro(resultatEnregistre.net_apres_impot_mensuel_moyen, 0, montantsMasques)}
              sub="moyenne sur 12 mois"
            />
          </div>
        </Card>
      )}

      <Card title="Taux d'épargne">
        {salaires.length === 0 ? (
          <EtatVide
            titre="Aucun salaire enregistré pour l'instant."
            description="Renseigne et enregistre un salaire ci-dessus pour voir apparaître ton taux d'épargne."
          />
        ) : (
          <div className="space-y-4">
            {resultatEnregistre && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-texte-attenue">{annee}</p>
                <p className="mt-1 text-3xl font-semibold text-texte">
                  {formatPctPositif(resultatEnregistre.taux_epargne_pct)}
                </p>
                <p className="mt-1 text-xs text-texte-attenue">
                  {formatEuro(resultatEnregistre.montant_investi_annee, 0, montantsMasques)} investis en achats réels
                  sur l'année, rapportés au{' '}
                  {resultatEnregistre.taux_epargne_base_net_apres_impot ? 'net après impôt' : 'net avant impôt'}.
                  Distinct du rendement du portefeuille (performance de marché sur ce qui est déjà investi).
                </p>
              </div>
            )}

            {moyenneTauxEpargne !== null && (
              <p className="text-sm text-texte-attenue">
                Moyenne sur {salaires.filter((s) => s.taux_epargne_pct !== null).length} année(s) saisie(s) :{' '}
                <span className="font-medium text-texte">{formatPctPositif(moyenneTauxEpargne)}</span>
              </p>
            )}

            <table className="w-full text-sm">
              <tbody>
                {[...salaires]
                  .sort((a, b) => b.annee - a.annee)
                  .map((s) => (
                    <tr key={s.annee} className="border-b border-bordure last:border-0">
                      <td className="py-2 text-texte-attenue">{s.annee}</td>
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
