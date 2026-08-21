import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { RapportPeriode } from '../api/types'
import Card from '../components/Card'
import EtatErreur from '../components/EtatErreur'
import EtatVide from '../components/EtatVide'
import { SkeletonTexte } from '../components/Skeleton'
import { usePreferencesAffichage } from '../hooks/usePreferencesAffichage'
import { formatDate, formatEuro, formatPct } from '../utils/format'
import { bornesPeriode } from '../utils/periode'

type Mode = 'mensuel' | 'annuel' | 'personnalise'

const MODES: { value: Mode; label: string }[] = [
  { value: 'mensuel', label: 'Mensuel' },
  { value: 'annuel', label: 'Annuel' },
  { value: 'personnalise', label: 'Personnalisé' },
]

function aujourdhuiISO(): string {
  return new Date().toISOString().slice(0, 10)
}

function moisCourant(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function libelleMois(moisSelectionne: string): string {
  const [annee, mois] = moisSelectionne.split('-').map(Number)
  const libelle = new Date(annee, mois - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
  return libelle.charAt(0).toUpperCase() + libelle.slice(1)
}

/** Dernier jour du mois `mois` (1-12) de `annee` — `new Date(annee, mois, 0)` retombe
 * sur le dernier jour du mois précédent l'index `mois` (0-indexé), donc exactement le
 * dernier jour du mois `mois` (1-indexé) demandé. */
function bornesDuMois(moisSelectionne: string): { dateDebut: string; dateFin: string } {
  const [anneeStr, moisStr] = moisSelectionne.split('-')
  const dernierJour = new Date(Number(anneeStr), Number(moisStr), 0).getDate()
  return { dateDebut: `${anneeStr}-${moisStr}-01`, dateFin: `${anneeStr}-${moisStr}-${String(dernierJour).padStart(2, '0')}` }
}

function bornesDeLAnnee(annee: number): { dateDebut: string; dateFin: string } {
  return { dateDebut: `${annee}-01-01`, dateFin: `${annee}-12-31` }
}

export default function RapportPage() {
  const { montantsMasques, periode: periodeTransverse } = usePreferencesAffichage()
  // Synchronisation à SENS UNIQUE, au premier montage seulement (backlog 2.K.3) :
  // si la Période transverse n'est pas "Tout" (son défaut), on pré-remplit le mode
  // "Personnalisé" avec ses bornes — modifier les dates ici ensuite n'écrit jamais
  // dans la préférence transverse, et la changer après coup ne remonte pas dans
  // cette page déjà montée (évite une boucle de rétroaction entre les deux
  // contrôles, cf. plan).
  const bornesInitiales = bornesPeriode(periodeTransverse)
  const [mode, setMode] = useState<Mode>(() => (bornesInitiales ? 'personnalise' : 'mensuel'))
  const [moisSelectionne, setMoisSelectionne] = useState(moisCourant())
  const [anneeSelectionnee, setAnneeSelectionnee] = useState(new Date().getFullYear())
  const [dateDebutPerso, setDateDebutPerso] = useState(bornesInitiales?.dateDebut ?? `${moisCourant()}-01`)
  const [dateFinPerso, setDateFinPerso] = useState(bornesInitiales?.dateFin ?? aujourdhuiISO())

  const [rapport, setRapport] = useState<RapportPeriode | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const bornes =
    mode === 'mensuel' ? bornesDuMois(moisSelectionne) : mode === 'annuel' ? bornesDeLAnnee(anneeSelectionnee) : { dateDebut: dateDebutPerso, dateFin: dateFinPerso }
  const periodeInvalide = mode === 'personnalise' && dateFinPerso < dateDebutPerso

  useEffect(() => {
    if (periodeInvalide) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    api
      .getRapportPeriode(bornes.dateDebut, bornes.dateFin)
      .then(setRapport)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [mode, moisSelectionne, anneeSelectionnee, dateDebutPerso, dateFinPerso, bornes.dateDebut, bornes.dateFin, periodeInvalide])

  const libellePeriode =
    mode === 'mensuel'
      ? libelleMois(moisSelectionne)
      : mode === 'annuel'
        ? String(anneeSelectionnee)
        : `${formatDate(dateDebutPerso)} au ${formatDate(dateFinPerso)}`

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold text-texte">Rapport</h2>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex gap-1">
            {MODES.map((m) => (
              <button
                key={m.value}
                onClick={() => setMode(m.value)}
                className={`rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors ${
                  mode === m.value ? 'bg-texte text-surface' : 'bg-surface-elevee text-texte-attenue hover:text-texte'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          {mode === 'mensuel' && (
            <input
              type="month"
              value={moisSelectionne}
              max={moisCourant()}
              onChange={(e) => setMoisSelectionne(e.target.value)}
              className="rounded-md border border-bordure bg-surface px-3 py-1.5 text-sm text-texte"
            />
          )}
          {mode === 'annuel' && (
            <input
              type="number"
              value={anneeSelectionnee}
              min={2000}
              max={new Date().getFullYear()}
              onChange={(e) => setAnneeSelectionnee(Number(e.target.value))}
              className="w-24 rounded-md border border-bordure bg-surface px-3 py-1.5 text-sm text-texte"
            />
          )}
          {mode === 'personnalise' && (
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={dateDebutPerso}
                max={aujourdhuiISO()}
                onChange={(e) => setDateDebutPerso(e.target.value)}
                className="rounded-md border border-bordure bg-surface px-3 py-1.5 text-sm text-texte"
              />
              <span className="text-sm text-texte-attenue">au</span>
              <input
                type="date"
                value={dateFinPerso}
                max={aujourdhuiISO()}
                onChange={(e) => setDateFinPerso(e.target.value)}
                className="rounded-md border border-bordure bg-surface px-3 py-1.5 text-sm text-texte"
              />
            </div>
          )}
        </div>
      </div>

      {periodeInvalide && <EtatErreur message="La date de fin doit être postérieure ou égale à la date de début." />}
      {!periodeInvalide && loading && <SkeletonTexte lignes={4} />}
      {!periodeInvalide && error && <EtatErreur message={error} />}

      {!periodeInvalide && rapport && !loading && (
        <>
          <h3 className="text-sm text-texte-attenue">{libellePeriode}</h3>

          {rapport.nombre_transactions === 0 && rapport.valeur_debut_periode === null ? (
            <Card>
              <EtatVide titre="Aucune donnée disponible pour cette période (aucune transaction, portefeuille pas encore constitué à cette date)." />
            </Card>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Card title="Valeur en fin de période">
                  <p className="text-2xl font-semibold text-texte">
                    {rapport.valeur_fin_periode !== null ? formatEuro(rapport.valeur_fin_periode, 0, montantsMasques) : '—'}
                  </p>
                </Card>
                <Card title="Évolution sur la période">
                  <p
                    className={`text-2xl font-semibold ${
                      rapport.evolution_pct === null ? 'text-texte' : rapport.evolution_pct >= 0 ? 'text-positif' : 'text-negatif'
                    }`}
                  >
                    {formatPct(rapport.evolution_pct)}
                  </p>
                </Card>
                <Card title="Dividendes perçus">
                  <p className="text-2xl font-semibold text-positif">{formatEuro(rapport.dividendes_percus, 2, montantsMasques)}</p>
                </Card>
              </div>

              <Card title="Plus gros mouvements de la période">
                {rapport.plus_gros_mouvements.length === 0 ? (
                  <EtatVide titre="Aucun mouvement sur cette période." />
                ) : (
                  <ul className="divide-y divide-bordure">
                    {rapport.plus_gros_mouvements.map((m, i) => (
                      <li key={i} className="flex items-center justify-between py-2 text-sm">
                        <span className="text-texte">
                          {formatDate(m.date)} · {m.nom ?? m.symbol ?? '—'}
                        </span>
                        <span className={`font-medium ${m.montant >= 0 ? 'text-positif' : 'text-texte'}`}>
                          {formatEuro(m.montant, 2, montantsMasques)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </>
          )}
        </>
      )}
    </div>
  )
}
