import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { BudgetSummary, CategorieBudget, JonctionPatrimoine, MouvementBancaire, RecurrenceDetectee, RegleCategorisation } from '../api/types'
import CategoriesEtReglesSection from '../components/CategoriesEtReglesSection'
import Card from '../components/Card'
import EtatErreur from '../components/EtatErreur'
import EtatVide from '../components/EtatVide'
import MouvementsSection from '../components/MouvementsSection'
import RecurrencesSection from '../components/RecurrencesSection'
import RepartitionSection from '../components/RepartitionSection'
import { SkeletonTexte } from '../components/Skeleton'
import StatTile from '../components/StatTile'
import { usePreferencesAffichage } from '../hooks/usePreferencesAffichage'
import { dateVersISO, formatDate, formatEuro } from '../utils/format'

type Mode = 'mensuel' | 'annuel' | 'personnalise'

const MODES: { value: Mode; label: string }[] = [
  { value: 'mensuel', label: 'Mensuel' },
  { value: 'annuel', label: 'Annuel' },
  { value: 'personnalise', label: 'Personnalisé' },
]

function aujourdhuiISO(): string {
  return dateVersISO(new Date())
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

function bornesDuMois(moisSelectionne: string): { dateDebut: string; dateFin: string } {
  const [anneeStr, moisStr] = moisSelectionne.split('-')
  const dernierJour = new Date(Number(anneeStr), Number(moisStr), 0).getDate()
  return { dateDebut: `${anneeStr}-${moisStr}-01`, dateFin: `${anneeStr}-${moisStr}-${String(dernierJour).padStart(2, '0')}` }
}

function bornesDeLAnnee(annee: number): { dateDebut: string; dateFin: string } {
  return { dateDebut: `${annee}-01-01`, dateFin: `${annee}-12-31` }
}

export default function BudgetPage() {
  const { montantsMasques } = usePreferencesAffichage()

  const [mode, setMode] = useState<Mode>('mensuel')
  const [moisSelectionne, setMoisSelectionne] = useState(moisCourant())
  const [anneeSelectionnee, setAnneeSelectionnee] = useState(new Date().getFullYear())
  const [dateDebutPerso, setDateDebutPerso] = useState(`${moisCourant()}-01`)
  const [dateFinPerso, setDateFinPerso] = useState(aujourdhuiISO())

  const [summary, setSummary] = useState<BudgetSummary | null>(null)
  const [mouvements, setMouvements] = useState<MouvementBancaire[]>([])
  const [categories, setCategories] = useState<CategorieBudget[]>([])
  const [regles, setRegles] = useState<RegleCategorisation[]>([])
  const [recurrences, setRecurrences] = useState<RecurrenceDetectee[]>([])
  const [jonction, setJonction] = useState<JonctionPatrimoine | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const bornes =
    mode === 'mensuel' ? bornesDuMois(moisSelectionne) : mode === 'annuel' ? bornesDeLAnnee(anneeSelectionnee) : { dateDebut: dateDebutPerso, dateFin: dateFinPerso }
  const periodeInvalide = mode === 'personnalise' && dateFinPerso < dateDebutPerso

  function chargerTout() {
    if (periodeInvalide) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    Promise.all([
      api.getBudgetSummary(bornes.dateDebut, bornes.dateFin),
      api.listMouvementsBancaires({ dateDebut: bornes.dateDebut, dateFin: bornes.dateFin }),
      api.listCategoriesBudget(),
      api.listReglesCategorisation(),
      // Récurrences (backlog 2.N.3) et jonction patrimoine (2.N.4) : la première ne
      // dépend pas de la période affichée (fenêtre glissante propre), la seconde si
      // (taux d'épargne/reste à vivre calculés sur la période sélectionnée).
      api.getBudgetRecurrences(),
      api.getJonctionPatrimoine(bornes.dateDebut, bornes.dateFin),
    ])
      .then(([s, m, c, r, rec, j]) => {
        setSummary(s)
        setMouvements(m)
        setCategories(c)
        setRegles(r)
        setRecurrences(rec)
        setJonction(j)
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(chargerTout, [mode, moisSelectionne, anneeSelectionnee, dateDebutPerso, dateFinPerso, bornes.dateDebut, bornes.dateFin, periodeInvalide])

  const libellePeriode =
    mode === 'mensuel'
      ? libelleMois(moisSelectionne)
      : mode === 'annuel'
        ? String(anneeSelectionnee)
        : `${formatDate(dateDebutPerso)} au ${formatDate(dateFinPerso)}`

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold text-texte">Budget</h2>
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
      {!periodeInvalide && error && <EtatErreur message={error} onReessayer={chargerTout} />}

      {!periodeInvalide && summary && !loading && (
        <>
          <h3 className="text-sm text-texte-attenue">{libellePeriode}</h3>

          {mouvements.length === 0 ? (
            <Card>
              <EtatVide
                titre="Aucun mouvement bancaire importé pour cette période."
                description="Importe un relevé (CSV, OFX ou QIF) depuis l'écran Import."
              />
            </Card>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <StatTile label="Entrées" value={formatEuro(summary.entrees, 0, montantsMasques)} tone="good" />
                <StatTile label="Sorties" value={formatEuro(summary.sorties, 0, montantsMasques)} />
                <StatTile
                  label="Disponible"
                  value={formatEuro(summary.disponible, 0, montantsMasques)}
                  tone={summary.disponible >= 0 ? 'good' : 'warning'}
                />
                <StatTile
                  label="Dépenses récurrentes / mois"
                  value={formatEuro(summary.depenses_recurrentes_mensuelles, 0, montantsMasques)}
                  sub="estimé sur les 3 derniers mois"
                />
              </div>

              {jonction && (jonction.taux_epargne_reel_pct !== null || jonction.reste_a_vivre !== null) && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {jonction.taux_epargne_reel_pct !== null && (
                    <StatTile
                      label="Taux d'épargne réel"
                      value={`${jonction.taux_epargne_reel_pct.toFixed(1)} %`}
                      sub="sorties catégorie « Épargne » / entrées"
                    />
                  )}
                  {jonction.reste_a_vivre !== null && (
                    <StatTile
                      label="Reste à vivre"
                      value={formatEuro(jonction.reste_a_vivre, 0, montantsMasques)}
                      sub="entrées − logement − charges récurrentes"
                      tone={jonction.reste_a_vivre >= 0 ? 'good' : 'warning'}
                    />
                  )}
                </div>
              )}
              {jonction && (jonction.categorie_epargne_introuvable || jonction.categorie_logement_introuvable) && (
                <p className="text-xs text-texte-attenue">
                  {jonction.categorie_epargne_introuvable && 'Taux d\'épargne indisponible : crée ou renomme une catégorie « Épargne » ci-dessous. '}
                  {jonction.categorie_logement_introuvable && 'Reste à vivre indisponible : crée ou renomme une catégorie « Logement » ci-dessous.'}
                </p>
              )}

              <RepartitionSection summary={summary} onCibleChanged={chargerTout} />
              <MouvementsSection mouvementsPeriode={mouvements} categories={categories} onCategorized={chargerTout} />
            </>
          )}

          <RecurrencesSection recurrences={recurrences} categories={categories} />
          <CategoriesEtReglesSection categories={categories} regles={regles} onChanged={chargerTout} />
        </>
      )}
    </div>
  )
}
