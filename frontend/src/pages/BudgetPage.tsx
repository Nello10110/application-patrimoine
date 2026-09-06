import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { BudgetSummary, CategorieBudget, JonctionPatrimoine, MouvementBancaire, RecurrenceDetectee, RegleCategorisation } from '../api/types'
import CategoriesEtReglesSection from '../components/CategoriesEtReglesSection'
import Card from '../components/Card'
import { GlassPanel } from '../components/GlassPanel'
import { SegmentedControl } from '../components/Controls'
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

  // Décomposition de la période pour la barre empilée du bloc héros : les plus gros
  // postes de sortie, puis le non dépensé — jamais une part négative (un « disponible »
  // négatif signifie qu'on a dépensé plus qu'encaissé : il n'y a alors rien à montrer
  // comme reste, et la barre ne représente que les sorties).
  const COULEURS_POSTE = ['bg-s1', 'bg-s2', 'bg-s3', 'bg-s4', 'bg-s5']
  const postesSortie = (summary?.repartition_sorties ?? [])
    .filter((r) => r.montant > 0)
    .slice(0, 5)
    .map((r, i) => ({ libelle: r.categorie_nom, montant: r.montant, classe: COULEURS_POSTE[i] }))
  const nonDepense = summary && summary.disponible > 0 ? summary.disponible : 0
  const decompositionMois = nonDepense > 0
    ? [...postesSortie, { libelle: 'Non dépensé', montant: nonDepense, classe: 'bg-track' }]
    : postesSortie
  const totalDecomposition = decompositionMois.reduce((somme, p) => somme + p.montant, 0) || 1

  return (
    <div className="space-y-[14px]">
      <div className="flex flex-wrap items-center justify-end md:justify-between gap-3">
        <div className="hidden md:block">
          <h1 className="text-[28px] font-semibold tracking-title text-ink">Budget</h1>
          <p className="mt-0.5 text-[13px] text-ink3">{libellePeriode}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <SegmentedControl
            options={MODES.map((m) => ({ valeur: m.value, libelle: m.label }))}
            valeur={mode}
            onChange={setMode}
            ariaLabel="Période"
          />

          {mode === 'mensuel' && (
            <input
              type="month"
              value={moisSelectionne}
              max={moisCourant()}
              onChange={(e) => setMoisSelectionne(e.target.value)}
              className="rounded-control border border-bordure bg-surface px-3 py-1.5 text-sm text-texte"
            />
          )}
          {mode === 'annuel' && (
            <input
              type="number"
              value={anneeSelectionnee}
              min={2000}
              max={new Date().getFullYear()}
              onChange={(e) => setAnneeSelectionnee(Number(e.target.value))}
              className="w-24 rounded-control border border-bordure bg-surface px-3 py-1.5 text-sm text-texte"
            />
          )}
          {mode === 'personnalise' && (
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={dateDebutPerso}
                max={aujourdhuiISO()}
                onChange={(e) => setDateDebutPerso(e.target.value)}
                className="rounded-control border border-bordure bg-surface px-3 py-1.5 text-sm text-texte"
              />
              <span className="text-sm text-texte-attenue">au</span>
              <input
                type="date"
                value={dateFinPerso}
                max={aujourdhuiISO()}
                onChange={(e) => setDateFinPerso(e.target.value)}
                className="rounded-control border border-bordure bg-surface px-3 py-1.5 text-sm text-texte"
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
          {mouvements.length === 0 ? (
            <Card>
              <EtatVide
                titre="Aucun mouvement bancaire importé pour cette période."
                description="Importe un relevé (CSV, OFX ou QIF) depuis l'écran Import."
              />
            </Card>
          ) : (
            <>
              {/* Bloc héros (maquette de la refonte) : « Disponible », le chiffre qui
                  répond à la question qu'on se pose en ouvrant cet écran, puis UNE
                  barre empilée qui décompose le mois — elle remplace la liste de
                  barres de progression par catégorie, qui donnait le même poids à
                  chaque poste. Le « non dépensé » y figure en `--track` : sans lui,
                  la barre ne montrerait que la façon de dépenser, jamais ce qui reste. */}
              <GlassPanel niveau="hero" className="px-6 py-5">
                <p className="text-[13px] font-medium text-ink3">Disponible sur la période</p>
                <p
                  className={`text-[48px] font-semibold leading-none tracking-hero ${
                    summary.disponible >= 0 ? 'text-ink' : 'text-neg'
                  }`}
                >
                  {formatEuro(summary.disponible, 0, montantsMasques)}
                </p>
                <p className="mt-1.5 text-[13px] text-ink3">
                  {formatEuro(summary.entrees, 0, montantsMasques)} d'entrées −{' '}
                  {formatEuro(summary.sorties, 0, montantsMasques)} de sorties
                </p>

                {decompositionMois.length > 0 && (
                  <>
                    <div className="mt-4 flex h-3 gap-0.5 overflow-hidden rounded-chip">
                      {decompositionMois.map((part) => (
                        <div
                          key={part.libelle}
                          className={part.classe}
                          style={{ width: `${(part.montant / totalDecomposition) * 100}%` }}
                          title={`${part.libelle} : ${formatEuro(part.montant, 0, montantsMasques)}`}
                        />
                      ))}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-[13px]">
                      {decompositionMois.map((part) => (
                        <span key={part.libelle} className="flex items-center gap-1.5">
                          <span aria-hidden className={`h-2 w-2 rounded-[3px] ${part.classe}`} />
                          <span className="text-ink3">{part.libelle}</span>
                          <span className="font-semibold text-ink">
                            {formatEuro(part.montant, 0, montantsMasques)}
                          </span>
                        </span>
                      ))}
                    </div>
                  </>
                )}
              </GlassPanel>

              {/* Les trois indicateurs secondaires sur UN seul rang : ils étaient
                  répartis en deux grilles de deux colonnes dont la première n'avait
                  qu'un occupant, ce qui laissait une demi-carte suivie d'un trou. */}
              <div className="grid grid-cols-1 gap-[14px] sm:grid-cols-2 lg:grid-cols-3">
                <StatTile
                  label="Dépenses récurrentes / mois"
                  value={formatEuro(summary.depenses_recurrentes_mensuelles, 0, montantsMasques)}
                  sub="estimé sur les 3 derniers mois"
                />
                {jonction?.taux_epargne_reel_pct != null && (
                  <StatTile
                    label="Taux d'épargne réel"
                    value={`${jonction.taux_epargne_reel_pct.toFixed(1)} %`}
                    sub="sorties catégorie « Épargne » / entrées"
                  />
                )}
                {jonction?.reste_a_vivre != null && (
                  <StatTile
                    label="Reste à vivre"
                    value={formatEuro(jonction.reste_a_vivre, 0, montantsMasques)}
                    sub="entrées − logement − charges récurrentes"
                    tone={jonction.reste_a_vivre >= 0 ? 'good' : 'warning'}
                  />
                )}
              </div>
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
