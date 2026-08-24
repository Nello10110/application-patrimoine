import { useEffect, useState } from 'react'
import { Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { api } from '../api/client'
import type { Detenteur, Holding, IndicateursSituation, ObjectifDetail, TypeObjectif } from '../api/types'
import Card from './Card'
import EtatErreur from './EtatErreur'
import EtatVide from './EtatVide'
import { SkeletonTexte } from './Skeleton'
import StatTile from './StatTile'
import { usePreferencesAffichage } from '../hooks/usePreferencesAffichage'
import { formatDate, formatEuro, formatPct } from '../utils/format'
import { COULEUR_AXE, STYLE_INFOBULLE, STYLE_TICK_AXE } from '../utils/chartTheme'

const TYPES_OBJECTIF: { value: TypeObjectif; label: string }[] = [
  { value: 'personnalise', label: 'Personnalisé' },
  { value: 'fire', label: 'Indépendance financière' },
  { value: 'precaution', label: 'Épargne de précaution' },
  { value: 'immobilier', label: 'Apport immobilier' },
  { value: 'remboursement', label: 'Remboursement anticipé' },
]

const LABEL_TYPE: Record<TypeObjectif, string> = Object.fromEntries(TYPES_OBJECTIF.map((t) => [t.value, t.label])) as Record<
  TypeObjectif,
  string
>

/** Phrase de diagnostic en langage naturel (backlog 2.O.1) — construite ici plutôt
 * que côté backend, qui ne renvoie que le code + les nombres bruts (même partage
 * des responsabilités que la phrase de variation du tableau de bord, backlog
 * 2.K.6, `utils/periode.ts`). */
function phraseDiagnostic(o: ObjectifDetail): string {
  switch (o.diagnostic) {
    case 'atteint':
      return 'Objectif atteint.'
    case 'echeance_depassee':
      return "Échéance dépassée sans que l'objectif soit atteint."
    case 'en_bonne_voie':
      return 'En bonne voie.'
    case 'en_retard':
      return `En retard de ${o.retard_mois} mois au rythme actuel.`
    case 'aucune_progression':
      return "Aucune progression mesurée pour l'instant."
  }
}

function toneDiagnostic(o: ObjectifDetail): 'good' | 'warning' | 'neutral' {
  if (o.diagnostic === 'atteint' || o.diagnostic === 'en_bonne_voie') return 'good'
  if (o.diagnostic === 'en_retard' || o.diagnostic === 'echeance_depassee') return 'warning'
  return 'neutral'
}

function ObjectifCard({ objectif, onDeleted }: { objectif: ObjectifDetail; onDeleted: () => void }) {
  const { montantsMasques } = usePreferencesAffichage()
  const [suppression, setSuppression] = useState(false)

  async function handleDelete() {
    if (!confirm(`Supprimer l'objectif « ${objectif.nom} » ?`)) return
    setSuppression(true)
    try {
      await api.deleteObjectif(objectif.id)
      onDeleted()
    } finally {
      setSuppression(false)
    }
  }

  const data = objectif.trajectoire_cible.map((p, i) => ({
    date: p.date,
    Cible: p.valeur,
    Réel: objectif.trajectoire_reelle[i]?.valeur ?? null,
  }))

  const tone = toneDiagnostic(objectif)
  const toneClass = tone === 'good' ? 'text-positif' : tone === 'warning' ? 'text-negatif' : 'text-texte-attenue'

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-texte">{objectif.nom}</h3>
          <p className="text-xs text-texte-attenue">
            {LABEL_TYPE[objectif.type]} · échéance {formatDate(objectif.echeance)}
          </p>
        </div>
        <button
          onClick={handleDelete}
          disabled={suppression}
          className="text-xs text-texte-attenue hover:text-negatif disabled:opacity-40"
        >
          Supprimer
        </button>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-texte-attenue">Valeur actuelle</p>
          <p className="mt-1 text-lg font-semibold text-texte">{formatEuro(objectif.valeur_actuelle, 0, montantsMasques)}</p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-texte-attenue">Montant cible</p>
          <p className="mt-1 text-lg font-semibold text-texte">{formatEuro(objectif.montant_cible, 0, montantsMasques)}</p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-texte-attenue">Progression</p>
          <p className="mt-1 text-lg font-semibold text-texte">{objectif.progression_pct !== null ? `${objectif.progression_pct}%` : '—'}</p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-texte-attenue">Diagnostic</p>
          <p className={`mt-1 text-sm font-semibold ${toneClass}`}>{phraseDiagnostic(objectif)}</p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <p className="text-xs text-texte-attenue">Rendement annuel requis (sans versement supplémentaire)</p>
          <p className="text-sm font-medium text-texte">
            {objectif.rendement_requis_pct !== null ? formatPct(objectif.rendement_requis_pct) : '—'}
          </p>
        </div>
        <div>
          <p className="text-xs text-texte-attenue">
            Contribution mensuelle nécessaire (à {objectif.rendement_hypothese_pct}% de rendement hypothèse)
          </p>
          <p className="text-sm font-medium text-texte">
            {objectif.contribution_mensuelle_necessaire !== null ? formatEuro(objectif.contribution_mensuelle_necessaire, 0, montantsMasques) : '—'}
          </p>
        </div>
      </div>

      {(objectif.actifs_rattaches.length > 0 || objectif.contributeurs.length > 0) && (
        <p className="mt-3 text-xs text-texte-attenue">
          {objectif.actifs_rattaches.length > 0 && `Actifs rattachés : ${objectif.actifs_rattaches.map((a) => a.nom ?? a.ticker).join(', ')}. `}
          {objectif.contributeurs.length > 0 && `Contributeurs : ${objectif.contributeurs.map((c) => c.nom).join(', ')}.`}
        </p>
      )}

      <ResponsiveContainer width="100%" height={200} className="mt-4">
        <LineChart data={data}>
          <XAxis dataKey="date" tickFormatter={(v) => formatDate(v)} tick={{ fontSize: 11, ...STYLE_TICK_AXE }} stroke={COULEUR_AXE} />
          <YAxis tickFormatter={(v) => formatEuro(Number(v), 0, montantsMasques)} width={80} tick={{ fontSize: 11, ...STYLE_TICK_AXE }} stroke={COULEUR_AXE} />
          <Tooltip formatter={(v) => formatEuro(Number(v), 0, montantsMasques)} labelFormatter={(v) => formatDate(String(v))} {...STYLE_INFOBULLE} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Line type="monotone" dataKey="Cible" stroke="#94a3b8" strokeDasharray="4 4" dot={false} />
          <Line type="monotone" dataKey="Réel" stroke="#2563eb" strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
      <p className="mt-1 text-xs text-texte-attenue">
        Trajectoire réelle ancrée sur deux mesures (création, aujourd'hui) — pas un historique complet des versements.
      </p>
    </Card>
  )
}

function NouvelObjectifForm({ holdings, detenteurs, onCreated }: { holdings: Holding[]; detenteurs: Detenteur[]; onCreated: () => void }) {
  const [nom, setNom] = useState('')
  const [type, setType] = useState<TypeObjectif>('personnalise')
  const [montantCible, setMontantCible] = useState('')
  const [echeance, setEcheance] = useState('')
  const [rendementHypothese, setRendementHypothese] = useState('0')
  const [holdingIds, setHoldingIds] = useState<number[]>([])
  const [detenteurIds, setDetenteurIds] = useState<number[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const valide = nom.trim() !== '' && Number(montantCible) > 0 && echeance !== ''

  async function handleSubmit() {
    if (!valide) return
    setSaving(true)
    setError(null)
    try {
      await api.createObjectif({
        nom: nom.trim(),
        type,
        montant_cible: Number(montantCible),
        echeance,
        rendement_hypothese_pct: Number(rendementHypothese) || 0,
        holding_ids: holdingIds,
        detenteur_ids: detenteurIds,
      })
      setNom('')
      setType('personnalise')
      setMontantCible('')
      setEcheance('')
      setRendementHypothese('0')
      setHoldingIds([])
      setDetenteurIds([])
      onCreated()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  function toggleSelection(id: number, selection: number[], setSelection: (ids: number[]) => void) {
    setSelection(selection.includes(id) ? selection.filter((x) => x !== id) : [...selection, id])
  }

  return (
    <Card title="Nouvel objectif">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="flex flex-col gap-1 text-xs font-medium text-texte-attenue">
          Nom
          <input value={nom} onChange={(e) => setNom(e.target.value)} className="rounded-md border border-bordure bg-surface px-2 py-1.5 text-sm text-texte" />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-texte-attenue">
          Type
          <select value={type} onChange={(e) => setType(e.target.value as TypeObjectif)} className="rounded-md border border-bordure bg-surface px-2 py-1.5 text-sm text-texte">
            {TYPES_OBJECTIF.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-texte-attenue">
          Montant cible (€)
          <input type="number" min={0} step="any" value={montantCible} onChange={(e) => setMontantCible(e.target.value)} className="rounded-md border border-bordure bg-surface px-2 py-1.5 text-sm text-texte" />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-texte-attenue">
          Échéance
          <input type="date" value={echeance} onChange={(e) => setEcheance(e.target.value)} className="rounded-md border border-bordure bg-surface px-2 py-1.5 text-sm text-texte" />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-texte-attenue">
          Rendement hypothèse (%, pour la contribution mensuelle)
          <input type="number" step="any" value={rendementHypothese} onChange={(e) => setRendementHypothese(e.target.value)} className="rounded-md border border-bordure bg-surface px-2 py-1.5 text-sm text-texte" />
        </label>
      </div>

      {holdings.length > 0 && (
        <div className="mt-4">
          <p className="mb-1 text-xs font-medium text-texte-attenue">
            Actifs rattachés — leur valeur cumulée mesure la progression réelle de l'objectif
          </p>
          <div className="flex flex-wrap gap-2">
            {holdings.map((h) => (
              <button
                key={h.id}
                type="button"
                onClick={() => toggleSelection(h.id, holdingIds, setHoldingIds)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  holdingIds.includes(h.id) ? 'bg-texte text-surface' : 'bg-surface-elevee text-texte-attenue hover:text-texte'
                }`}
              >
                {h.ticker}
              </button>
            ))}
          </div>
        </div>
      )}

      {detenteurs.length > 0 && (
        <div className="mt-4">
          <p className="mb-1 text-xs font-medium text-texte-attenue">Contributeurs</p>
          <div className="flex flex-wrap gap-2">
            {detenteurs.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => toggleSelection(d.id, detenteurIds, setDetenteurIds)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  detenteurIds.includes(d.id) ? 'bg-texte text-surface' : 'bg-surface-elevee text-texte-attenue hover:text-texte'
                }`}
              >
                {d.nom}
              </button>
            ))}
          </div>
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={!valide || saving}
        className="mt-4 rounded-md bg-accent px-4 py-2 text-sm font-medium text-surface disabled:opacity-40"
      >
        {saving ? 'Création...' : "Créer l'objectif"}
      </button>
      {error && <p className="mt-2 text-sm text-negatif">{error}</p>}
    </Card>
  )
}

function IndicateursSituationCard({ indicateurs }: { indicateurs: IndicateursSituation }) {
  const { montantsMasques } = usePreferencesAffichage()

  return (
    <Card title="Indicateurs de situation">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatTile
          label="Matelas de sécurité"
          value={indicateurs.matelas_securite_mois !== null ? `${indicateurs.matelas_securite_mois} mois` : '—'}
          sub="épargne disponible / dépenses mensuelles"
        />
        <StatTile
          label="Taux d'endettement"
          value={indicateurs.taux_endettement_pct !== null ? formatPct(indicateurs.taux_endettement_pct) : '—'}
          sub="mensualités / revenus nets"
          tone={indicateurs.taux_endettement_pct !== null && indicateurs.taux_endettement_pct > 35 ? 'warning' : 'neutral'}
        />
        <StatTile
          label="Part du patrimoine immobilisée"
          value={indicateurs.part_immobilisee_pct !== null ? formatPct(indicateurs.part_immobilisee_pct) : '—'}
          sub="actifs non liquides / patrimoine brut"
        />
      </div>
      {(indicateurs.matelas_securite_mois === null || indicateurs.taux_endettement_pct === null) && (
        <p className="mt-3 text-xs text-texte-attenue">
          Nécessite des mouvements bancaires importés (écran Budget) sur les 3 derniers mois pour estimer dépenses et revenus.
          {' '}
          {formatEuro(indicateurs.epargne_disponible, 0, montantsMasques)} d'épargne disponible détectée,{' '}
          {formatEuro(indicateurs.mensualites_totales, 0, montantsMasques)} de mensualités d'emprunts.
        </p>
      )}
    </Card>
  )
}

export default function ObjectifsSuivisSection() {
  const [objectifs, setObjectifs] = useState<ObjectifDetail[]>([])
  const [holdings, setHoldings] = useState<Holding[]>([])
  const [detenteurs, setDetenteurs] = useState<Detenteur[]>([])
  const [indicateurs, setIndicateurs] = useState<IndicateursSituation | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  function chargerTout() {
    setLoading(true)
    setError(null)
    Promise.all([api.listObjectifs(), api.listHoldings(), api.listDetenteurs(), api.getIndicateursSituation()])
      .then(([o, h, d, i]) => {
        setObjectifs(o)
        setHoldings(h)
        setDetenteurs(d)
        setIndicateurs(i)
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(chargerTout, [])

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-texte">Objectifs suivis</h2>
        <p className="mt-1 text-sm text-texte-attenue">
          Un objectif = un montant cible, une échéance, et les actifs dont la valeur mesure la progression réelle — distinct
          du simulateur ci-dessous, qui projette sans rien conserver.
        </p>
      </div>

      {loading && <SkeletonTexte lignes={3} />}
      {!loading && error && <EtatErreur message={error} onReessayer={chargerTout} />}

      {!loading && !error && (
        <>
          {objectifs.length === 0 ? (
            <Card>
              <EtatVide titre="Aucun objectif suivi pour l'instant." description="Crée-en un avec le formulaire ci-dessous." />
            </Card>
          ) : (
            objectifs.map((o) => <ObjectifCard key={o.id} objectif={o} onDeleted={chargerTout} />)
          )}

          <NouvelObjectifForm holdings={holdings} detenteurs={detenteurs} onCreated={chargerTout} />
          {indicateurs && <IndicateursSituationCard indicateurs={indicateurs} />}
        </>
      )}
    </div>
  )
}
