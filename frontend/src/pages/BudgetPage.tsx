import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { BudgetSummary, CategorieBudget, MouvementBancaire, RegleCategorisation } from '../api/types'
import Card from '../components/Card'
import EtatErreur from '../components/EtatErreur'
import EtatVide from '../components/EtatVide'
import { SkeletonTexte } from '../components/Skeleton'
import StatTile from '../components/StatTile'
import { usePreferencesAffichage } from '../hooks/usePreferencesAffichage'
import { formatDate, formatEuro } from '../utils/format'

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

function bornesDuMois(moisSelectionne: string): { dateDebut: string; dateFin: string } {
  const [anneeStr, moisStr] = moisSelectionne.split('-')
  const dernierJour = new Date(Number(anneeStr), Number(moisStr), 0).getDate()
  return { dateDebut: `${anneeStr}-${moisStr}-01`, dateFin: `${anneeStr}-${moisStr}-${String(dernierJour).padStart(2, '0')}` }
}

function bornesDeLAnnee(annee: number): { dateDebut: string; dateFin: string } {
  return { dateDebut: `${annee}-01-01`, dateFin: `${annee}-12-31` }
}

/** Édition inline du budget cible d'une catégorie racine (backlog 2.N.2) — champ
 * texte local, enregistré sur perte de focus/Entrée plutôt qu'à chaque frappe. */
function CibleInput({ categorieId, valeurInitiale, onSaved }: { categorieId: number; valeurInitiale: number | null; onSaved: () => void }) {
  const [valeur, setValeur] = useState(valeurInitiale !== null ? String(valeurInitiale) : '')
  const [saving, setSaving] = useState(false)

  async function enregistrer() {
    const nombre = Number(valeur)
    if (valeur.trim() === '' || Number.isNaN(nombre) || nombre < 0) return
    setSaving(true)
    try {
      await api.setBudgetCible(categorieId, nombre)
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  return (
    <input
      type="number"
      min={0}
      step="any"
      value={valeur}
      disabled={saving}
      onChange={(e) => setValeur(e.target.value)}
      onBlur={enregistrer}
      onKeyDown={(e) => e.key === 'Enter' && enregistrer()}
      placeholder="—"
      className="w-24 rounded-md border border-bordure bg-surface px-2 py-1 text-right text-sm text-texte"
    />
  )
}

function RepartitionSection({ summary, onCibleChanged }: { summary: BudgetSummary; onCibleChanged: () => void }) {
  const { montantsMasques } = usePreferencesAffichage()

  if (summary.repartition_sorties.length === 0) {
    return (
      <Card title="Répartition des sorties">
        <EtatVide titre="Aucune sortie sur cette période." />
      </Card>
    )
  }

  return (
    <Card title="Répartition des sorties">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-bordure text-left text-xs font-medium uppercase text-texte-attenue">
            <th className="py-2 pr-4">Catégorie</th>
            <th className="py-2 pr-4 text-right">Montant</th>
            <th className="py-2 pr-4 text-right">Budget cible</th>
            <th className="py-2 pr-4 text-right">Écart</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-bordure">
          {summary.repartition_sorties.map((item) => {
            const ecart = item.cible_mensuelle !== null ? item.cible_mensuelle - item.montant : null
            return (
              <tr key={item.categorie_id ?? 'non-categorise'}>
                <td className="py-2 pr-4 text-texte">{item.categorie_nom}</td>
                <td className="py-2 pr-4 text-right text-texte">{formatEuro(item.montant, 2, montantsMasques)}</td>
                <td className="py-2 pr-4 text-right">
                  {item.categorie_id !== null ? (
                    <CibleInput categorieId={item.categorie_id} valeurInitiale={item.cible_mensuelle} onSaved={onCibleChanged} />
                  ) : (
                    '—'
                  )}
                </td>
                <td className={`py-2 pr-4 text-right font-medium ${ecart === null ? 'text-texte-attenue' : ecart >= 0 ? 'text-positif' : 'text-negatif'}`}>
                  {ecart !== null ? formatEuro(ecart, 2, montantsMasques) : '—'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </Card>
  )
}

function CategoriesEtReglesSection({
  categories,
  regles,
  onChanged,
}: {
  categories: CategorieBudget[]
  regles: RegleCategorisation[]
  onChanged: () => void
}) {
  const [nouvelleCategorie, setNouvelleCategorie] = useState('')
  const [motif, setMotif] = useState('')
  const [categorieRegle, setCategorieRegle] = useState<number | ''>('')
  const [reapplicationEnCours, setReapplicationEnCours] = useState(false)
  const [messageReapplication, setMessageReapplication] = useState<string | null>(null)

  const categoriesRacines = categories.filter((c) => c.parent_id === null)

  async function ajouterCategorie() {
    if (!nouvelleCategorie.trim()) return
    await api.createCategorieBudget(nouvelleCategorie.trim())
    setNouvelleCategorie('')
    onChanged()
  }

  async function supprimerCategorie(id: number) {
    await api.deleteCategorieBudget(id)
    onChanged()
  }

  async function ajouterRegle() {
    if (!motif.trim() || categorieRegle === '') return
    await api.createRegleCategorisation(motif.trim(), categorieRegle)
    setMotif('')
    setCategorieRegle('')
    onChanged()
  }

  async function supprimerRegle(id: number) {
    await api.deleteRegleCategorisation(id)
    onChanged()
  }

  async function reappliquer() {
    setReapplicationEnCours(true)
    setMessageReapplication(null)
    try {
      const res = await api.reappliquerReglesCategorisation()
      setMessageReapplication(`${res.mouvements_modifies} mouvement(s) recatégorisé(s).`)
      onChanged()
    } finally {
      setReapplicationEnCours(false)
    }
  }

  return (
    <details open className="rounded-lg border border-bordure bg-surface">
      <summary className="cursor-pointer px-4 py-3 text-sm font-semibold uppercase tracking-wide text-texte-attenue">
        Catégories et règles de catégorisation
      </summary>
      <div className="space-y-6 border-t border-bordure p-4">
        <div>
          <h4 className="mb-2 text-sm font-medium text-texte">Catégories</h4>
          <ul className="mb-3 flex flex-wrap gap-2">
            {categoriesRacines.map((c) => (
              <li key={c.id} className="flex items-center gap-1.5 rounded-full bg-surface-elevee px-3 py-1 text-sm text-texte">
                {c.nom}
                <button onClick={() => supprimerCategorie(c.id)} aria-label={`Supprimer ${c.nom}`} className="text-texte-attenue hover:text-negatif">
                  ×
                </button>
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <input
              value={nouvelleCategorie}
              onChange={(e) => setNouvelleCategorie(e.target.value)}
              placeholder="Nouvelle catégorie"
              className="rounded-md border border-bordure bg-surface px-2 py-1.5 text-sm text-texte"
            />
            <button onClick={ajouterCategorie} className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-surface">
              Ajouter
            </button>
          </div>
        </div>

        <div>
          <h4 className="mb-2 text-sm font-medium text-texte">
            Règles de catégorisation automatique
            <span className="ml-1 font-normal normal-case text-texte-attenue">— « le libellé contient le motif → catégorie »</span>
          </h4>
          {regles.length > 0 && (
            <ul className="mb-3 space-y-1">
              {regles.map((r) => {
                const cat = categories.find((c) => c.id === r.categorie_id)
                return (
                  <li key={r.id} className="flex items-center justify-between gap-2 text-sm text-texte">
                    <span>
                      « {r.motif} » → {cat?.nom ?? '?'}
                    </span>
                    <button onClick={() => supprimerRegle(r.id)} className="text-xs text-texte-attenue hover:text-negatif">
                      Supprimer
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
          <div className="flex flex-wrap gap-2">
            <input
              value={motif}
              onChange={(e) => setMotif(e.target.value)}
              placeholder="Motif (ex. sncf)"
              className="rounded-md border border-bordure bg-surface px-2 py-1.5 text-sm text-texte"
            />
            <select
              value={categorieRegle}
              onChange={(e) => setCategorieRegle(e.target.value ? Number(e.target.value) : '')}
              className="rounded-md border border-bordure bg-surface px-2 py-1.5 text-sm text-texte"
            >
              <option value="">— Catégorie —</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.parent_id !== null ? '↳ ' : ''}
                  {c.nom}
                </option>
              ))}
            </select>
            <button onClick={ajouterRegle} className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-surface">
              Ajouter la règle
            </button>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <button
              onClick={reappliquer}
              disabled={reapplicationEnCours}
              className="rounded-md border border-bordure px-3 py-1.5 text-sm font-medium text-texte disabled:opacity-40"
            >
              {reapplicationEnCours ? 'Réapplication en cours...' : 'Réappliquer les règles en masse'}
            </button>
            {messageReapplication && <span className="text-sm text-texte-attenue">{messageReapplication}</span>}
          </div>
        </div>
      </div>
    </details>
  )
}

/** Filtres catégorie/compte (backlog 2.N.2) — appliqués côté client sur la liste
 * déjà chargée pour la période : le volume d'un budget personnel reste modeste, et
 * ça évite un aller-retour réseau supplémentaire à chaque changement de filtre
 * (même logique que le filtrage par catégorie de `PortefeuillePage`). */
function MouvementsSection({
  mouvementsPeriode,
  categories,
  onCategorized,
}: {
  mouvementsPeriode: MouvementBancaire[]
  categories: CategorieBudget[]
  onCategorized: () => void
}) {
  const { montantsMasques } = usePreferencesAffichage()
  const [filtreCategorieId, setFiltreCategorieId] = useState<number | 'TOUTES' | 'NON_CATEGORISE'>('TOUTES')
  const [filtreCompte, setFiltreCompte] = useState('TOUS')

  const comptesDisponibles = Array.from(new Set(mouvementsPeriode.map((m) => m.compte).filter((c): c is string => Boolean(c)))).sort(
    (a, b) => a.localeCompare(b, 'fr'),
  )

  const mouvements = mouvementsPeriode.filter((m) => {
    if (filtreCategorieId === 'NON_CATEGORISE' && m.categorie_id !== null) return false
    if (typeof filtreCategorieId === 'number' && m.categorie_id !== filtreCategorieId) return false
    if (filtreCompte !== 'TOUS' && m.compte !== filtreCompte) return false
    return true
  })

  const filtres = (
    <div className="flex flex-wrap gap-2">
      <select
        value={filtreCategorieId}
        onChange={(e) => setFiltreCategorieId(e.target.value === 'TOUTES' || e.target.value === 'NON_CATEGORISE' ? e.target.value : Number(e.target.value))}
        className="rounded-md border border-bordure bg-surface px-2 py-1 text-xs text-texte"
      >
        <option value="TOUTES">Toutes catégories</option>
        <option value="NON_CATEGORISE">Non catégorisé</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.parent_id !== null ? '↳ ' : ''}
            {c.nom}
          </option>
        ))}
      </select>
      {comptesDisponibles.length > 0 && (
        <select
          value={filtreCompte}
          onChange={(e) => setFiltreCompte(e.target.value)}
          className="rounded-md border border-bordure bg-surface px-2 py-1 text-xs text-texte"
        >
          <option value="TOUS">Tous les comptes</option>
          {comptesDisponibles.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      )}
    </div>
  )

  if (mouvementsPeriode.length === 0) {
    return (
      <Card title="Mouvements">
        <EtatVide titre="Aucun mouvement sur cette période." description="Importe un relevé bancaire depuis l'écran Import." />
      </Card>
    )
  }

  return (
    <Card title="Mouvements" headerActions={filtres}>
      {mouvements.length === 0 ? (
        <EtatVide titre="Aucun mouvement ne correspond à ce filtre." />
      ) : (
        <div className="max-h-96 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-surface">
              <tr className="border-b border-bordure text-left text-xs font-medium uppercase text-texte-attenue">
                <th className="py-2 pr-4">Date</th>
                <th className="py-2 pr-4">Libellé</th>
                <th className="py-2 pr-4 text-right">Montant</th>
                <th className="py-2 pr-4">Catégorie</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-bordure">
              {mouvements.map((m) => (
                <tr key={m.id}>
                  <td className="py-2 pr-4 text-texte-attenue">{formatDate(m.date)}</td>
                  <td className="py-2 pr-4 text-texte">{m.libelle}</td>
                  <td className={`py-2 pr-4 text-right font-medium ${m.montant >= 0 ? 'text-positif' : 'text-texte'}`}>
                    {formatEuro(m.montant, 2, montantsMasques)}
                  </td>
                  <td className="py-2 pr-4">
                    <select
                      value={m.categorie_id ?? ''}
                      onChange={(e) => api.categoriserMouvement(m.id, e.target.value ? Number(e.target.value) : null).then(onCategorized)}
                      className="rounded-md border border-bordure bg-surface px-2 py-1 text-xs text-texte"
                    >
                      <option value="">Non catégorisé</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.parent_id !== null ? '↳ ' : ''}
                          {c.nom}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
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
    ])
      .then(([s, m, c, r]) => {
        setSummary(s)
        setMouvements(m)
        setCategories(c)
        setRegles(r)
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

              <RepartitionSection summary={summary} onCibleChanged={chargerTout} />
              <MouvementsSection mouvementsPeriode={mouvements} categories={categories} onCategorized={chargerTout} />
            </>
          )}

          <CategoriesEtReglesSection categories={categories} regles={regles} onChanged={chargerTout} />
        </>
      )}
    </div>
  )
}
