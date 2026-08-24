import { useEffect, useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { api } from '../api/client'
import type { Detenteur, HoldingDetail, ValuationHistoryPoint } from '../api/types'
import Card from './Card'
import HoldingPriceHistoryChart from './HoldingPriceHistoryChart'
import PieChartCard from './PieChartCard'
import { usePreferencesAffichage } from '../hooks/usePreferencesAffichage'
import { formatDate, formatEuro, formatPct, formatQuantite } from '../utils/format'
import { COULEUR_AXE, COULEUR_GRILLE, STYLE_INFOBULLE, STYLE_TICK_AXE } from '../utils/chartTheme'

const CATEGORY_LABELS: Record<string, string> = {
  STOCK: 'Action',
  FUND: 'ETF / Fonds',
  CRYPTO: 'Crypto',
  BOND: 'Obligation',
  PRIVATE_FUND: 'Private Equity',
}

/** Répartition entre détenteurs (backlog 2.L.1) — n'apparaît que si l'utilisateur a
 * déclaré au moins un détenteur (Réglages). Gère son propre état, indépendant du
 * `detail` du composant parent : après enregistrement, recharge la fiche pour
 * obtenir la part détenue/nette à jour sans faire remonter l'état au parent. */
function DetenteursSection({ ticker, quotitesInitiales }: { ticker: string; quotitesInitiales: HoldingDetail['quotites'] }) {
  const { montantsMasques } = usePreferencesAffichage()
  const [detenteurs, setDetenteurs] = useState<Detenteur[]>([])
  const [saisie, setSaisie] = useState<Record<number, string>>({})
  const [quotitesEnregistrees, setQuotitesEnregistrees] = useState(quotitesInitiales)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .listDetenteurs()
      .then((liste) => {
        setDetenteurs(liste)
        const init: Record<number, string> = {}
        for (const q of quotitesInitiales) init[q.detenteur_id] = String(q.quotite_pct)
        setSaisie(init)
      })
      .catch(() => setDetenteurs([]))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `ticker` change = remontage du composant parent (route/modale), pas de resynchronisation nécessaire en cours de vie.
  }, [ticker])

  if (detenteurs.length === 0) return null

  const total = detenteurs.reduce((somme, d) => somme + (Number(saisie[d.id]) || 0), 0)
  const repartitionEnCours = detenteurs.some((d) => (Number(saisie[d.id]) || 0) > 0)
  const totalValide = !repartitionEnCours || Math.abs(total - 100) < 0.01

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      const quotites = detenteurs
        .map((d) => ({ detenteur_id: d.id, quotite_pct: Number(saisie[d.id]) || 0 }))
        .filter((q) => q.quotite_pct > 0)
      await api.setHoldingQuotites(ticker, quotites)
      const detailFrais = await api.getHoldingDetail(ticker)
      setQuotitesEnregistrees(detailFrais.quotites)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card title="Détenteurs">
      <p className="mb-4 text-sm text-texte">
        Répartition de cette ligne entre les personnes/sociétés déclarées dans Réglages — la somme doit faire 100 % (ou
        rester à 0 % pour ne pas répartir, 100 % foyer implicite).
      </p>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-bordure text-left text-xs font-medium uppercase text-texte-attenue">
            <th className="py-2 pr-4">Détenteur</th>
            <th className="py-2 pr-4">Quotité</th>
            <th className="py-2 pr-4 text-right">Part détenue</th>
            <th className="py-2 pr-4 text-right">Part nette</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-bordure">
          {detenteurs.map((d) => {
            const enregistree = quotitesEnregistrees.find((q) => q.detenteur_id === d.id)
            return (
              <tr key={d.id}>
                <td className="py-2 pr-4 text-texte">{d.nom}</td>
                <td className="py-2 pr-4">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step="any"
                    value={saisie[d.id] ?? ''}
                    onChange={(e) => setSaisie({ ...saisie, [d.id]: e.target.value })}
                    className="w-20 rounded-md border border-bordure bg-surface px-2 py-1 text-sm text-texte"
                  />
                  %
                </td>
                <td className="py-2 pr-4 text-right text-texte">
                  {enregistree ? formatEuro(enregistree.part_detenue, 2, montantsMasques) : '—'}
                </td>
                <td className="py-2 pr-4 text-right font-medium text-texte">
                  {enregistree ? formatEuro(enregistree.part_nette, 2, montantsMasques) : '—'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={!totalValide || saving}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-surface disabled:opacity-40"
        >
          Enregistrer
        </button>
        {!totalValide && <span className="text-sm text-negatif">Total actuel : {total.toFixed(2)} % (doit faire 100 %)</span>}
        {error && <span className="text-sm text-negatif">{error}</span>}
      </div>
    </Card>
  )
}

const OPTIONS_TYPE_LOCATION = [
  { value: '', label: 'Non renseigné' },
  { value: 'nue', label: 'Location nue' },
  { value: 'meublee', label: 'Location meublée' },
  { value: 'pinel', label: 'Pinel' },
  { value: 'lmnp', label: 'LMNP' },
  { value: 'saisonniere', label: 'Saisonnière' },
]

interface FormImmobilier {
  type_location: string
  loyer_mensuel: string
  charges_mensuelles: string
  frais_annuels: string
  surface_m2: string
  nb_pieces: string
  annee_construction: string
  dpe: string
}

function formulaireDepuis(immo: HoldingDetail['immobilier']): FormImmobilier {
  return {
    type_location: immo?.type_location ?? '',
    loyer_mensuel: immo?.loyer_mensuel !== null && immo?.loyer_mensuel !== undefined ? String(immo.loyer_mensuel) : '',
    charges_mensuelles:
      immo?.charges_mensuelles !== null && immo?.charges_mensuelles !== undefined ? String(immo.charges_mensuelles) : '',
    frais_annuels: immo?.frais_annuels !== null && immo?.frais_annuels !== undefined ? String(immo.frais_annuels) : '',
    surface_m2: immo?.surface_m2 !== null && immo?.surface_m2 !== undefined ? String(immo.surface_m2) : '',
    nb_pieces: immo?.nb_pieces !== null && immo?.nb_pieces !== undefined ? String(immo.nb_pieces) : '',
    annee_construction:
      immo?.annee_construction !== null && immo?.annee_construction !== undefined ? String(immo.annee_construction) : '',
    dpe: immo?.dpe ?? '',
  }
}

/** Fiche immobilier complète (backlog 2.M.3) : caractéristiques + bloc location,
 * cashflow/rentabilité/prix au m² calculés côté serveur (jamais recalculés ici),
 * et historique daté des valorisations — jamais écrasé, une nouvelle ligne à chaque
 * changement de `valeur_estimee` (cf. `PositionsTable`/formulaire d'ajout du
 * Portefeuille, seuls endroits où `valeur_estimee` se modifie). N'apparaît que pour
 * `type_actif === 'REAL_ESTATE'`. */
function ImmobilierSection({ ticker, immobilierInitial }: { ticker: string; immobilierInitial: HoldingDetail['immobilier'] }) {
  const { montantsMasques } = usePreferencesAffichage()
  const [immobilier, setImmobilier] = useState(immobilierInitial)
  const [form, setForm] = useState<FormImmobilier>(() => formulaireDepuis(immobilierInitial))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [historique, setHistorique] = useState<ValuationHistoryPoint[]>([])

  useEffect(() => {
    api
      .getHoldingValuationHistory(ticker)
      .then(setHistorique)
      .catch(() => setHistorique([]))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `ticker` change = remontage du composant parent (route/modale).
  }, [ticker])

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      await api.updateHoldingImmobilier(ticker, {
        type_location: form.type_location || null,
        loyer_mensuel: form.loyer_mensuel ? Number(form.loyer_mensuel) : null,
        charges_mensuelles: form.charges_mensuelles ? Number(form.charges_mensuelles) : null,
        frais_annuels: form.frais_annuels ? Number(form.frais_annuels) : null,
        surface_m2: form.surface_m2 ? Number(form.surface_m2) : null,
        nb_pieces: form.nb_pieces ? Number(form.nb_pieces) : null,
        annee_construction: form.annee_construction ? Number(form.annee_construction) : null,
        dpe: form.dpe || null,
      })
      // Cashflow/rentabilité/prix au m² sont calculés côté serveur (jamais recalculés
      // ici) : on relit la fiche complète pour les obtenir à jour, même pattern que
      // `DetenteursSection` après l'enregistrement d'une quotité.
      const detailFrais = await api.getHoldingDetail(ticker)
      setImmobilier(detailFrais.immobilier)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Card title="Immobilier — caractéristiques et location">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs font-medium text-texte-attenue">
            Type de location
            <select
              value={form.type_location}
              onChange={(e) => setForm({ ...form, type_location: e.target.value })}
              className="rounded-md border border-bordure bg-surface px-2 py-1.5 text-sm text-texte"
            >
              {OPTIONS_TYPE_LOCATION.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-texte-attenue">
            Loyer mensuel (€)
            <input
              type="number"
              step="any"
              value={form.loyer_mensuel}
              onChange={(e) => setForm({ ...form, loyer_mensuel: e.target.value })}
              className="rounded-md border border-bordure bg-surface px-2 py-1.5 text-sm text-texte"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-texte-attenue">
            Charges mensuelles (€)
            <input
              type="number"
              step="any"
              value={form.charges_mensuelles}
              onChange={(e) => setForm({ ...form, charges_mensuelles: e.target.value })}
              className="rounded-md border border-bordure bg-surface px-2 py-1.5 text-sm text-texte"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-texte-attenue">
            Frais annuels (taxe foncière, copropriété, assurance, gestion — total)
            <input
              type="number"
              step="any"
              value={form.frais_annuels}
              onChange={(e) => setForm({ ...form, frais_annuels: e.target.value })}
              className="rounded-md border border-bordure bg-surface px-2 py-1.5 text-sm text-texte"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-texte-attenue">
            Surface (m²)
            <input
              type="number"
              step="any"
              value={form.surface_m2}
              onChange={(e) => setForm({ ...form, surface_m2: e.target.value })}
              className="rounded-md border border-bordure bg-surface px-2 py-1.5 text-sm text-texte"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-texte-attenue">
            Nombre de pièces
            <input
              type="number"
              step="1"
              value={form.nb_pieces}
              onChange={(e) => setForm({ ...form, nb_pieces: e.target.value })}
              className="rounded-md border border-bordure bg-surface px-2 py-1.5 text-sm text-texte"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-texte-attenue">
            Année de construction
            <input
              type="number"
              step="1"
              value={form.annee_construction}
              onChange={(e) => setForm({ ...form, annee_construction: e.target.value })}
              className="rounded-md border border-bordure bg-surface px-2 py-1.5 text-sm text-texte"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-texte-attenue">
            DPE
            <input
              value={form.dpe}
              onChange={(e) => setForm({ ...form, dpe: e.target.value })}
              placeholder="A à G"
              maxLength={2}
              className="w-20 rounded-md border border-bordure bg-surface px-2 py-1.5 text-sm text-texte"
            />
          </label>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="mt-4 rounded-md bg-accent px-4 py-2 text-sm font-medium text-surface disabled:opacity-40"
        >
          {saving ? 'Enregistrement...' : 'Enregistrer'}
        </button>
        {error && <p className="mt-2 text-sm text-negatif">{error}</p>}
      </Card>

      {immobilier && (immobilier.cashflow_mensuel !== null || immobilier.prix_m2 !== null) && (
        <Card title="Cashflow et rentabilité">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {immobilier.cashflow_mensuel !== null && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-texte-attenue">Cashflow mensuel</p>
                <p className={`mt-1 text-lg font-semibold ${immobilier.cashflow_mensuel >= 0 ? 'text-positif' : 'text-negatif'}`}>
                  {formatEuro(immobilier.cashflow_mensuel, 2, montantsMasques)}
                </p>
                <p className="mt-1 text-xs text-texte-attenue">loyer − charges − frais/12 − mensualité</p>
              </div>
            )}
            {immobilier.rentabilite_brute_pct !== null && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-texte-attenue">Rentabilité brute</p>
                <p className="mt-1 text-lg font-semibold text-texte">{formatPct(immobilier.rentabilite_brute_pct)}</p>
                <p className="mt-1 text-xs text-texte-attenue">loyer annuel / prix d'acquisition</p>
              </div>
            )}
            {immobilier.rentabilite_nette_pct !== null && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-texte-attenue">Rentabilité nette</p>
                <p className="mt-1 text-lg font-semibold text-texte">{formatPct(immobilier.rentabilite_nette_pct)}</p>
                <p className="mt-1 text-xs text-texte-attenue">(loyer − charges − frais) / prix d'acquisition</p>
              </div>
            )}
            {immobilier.prix_m2 !== null && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-texte-attenue">Prix au m²</p>
                <p className="mt-1 text-lg font-semibold text-texte">{formatEuro(immobilier.prix_m2, 2, montantsMasques)}</p>
              </div>
            )}
            {immobilier.emprunt_mensualite !== null && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-texte-attenue">Mensualité de l'emprunt rattaché</p>
                <p className="mt-1 text-lg font-semibold text-texte">{formatEuro(immobilier.emprunt_mensualite, 2, montantsMasques)}</p>
              </div>
            )}
          </div>
        </Card>
      )}

      {historique.length > 0 && (
        <Card title="Historique de valorisation">
          <p className="mb-3 text-xs text-texte-attenue">
            Chaque estimation est datée et conservée — l'ancienne n'est jamais écrasée.
          </p>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-bordure text-left text-xs font-medium uppercase text-texte-attenue">
                <th className="py-2 pr-4">Date</th>
                <th className="py-2 pr-4 text-right">Valeur estimée</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-bordure">
              {[...historique].reverse().map((p, i) => (
                <tr key={`${p.date_valeur}-${i}`}>
                  <td className="py-2 pr-4 text-texte">{formatDate(p.date_valeur)}</td>
                  <td className="py-2 pr-4 text-right font-medium text-texte">{formatEuro(p.valeur, 2, montantsMasques)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  )
}

export default function HoldingDetailContent({ detail, titleId }: { detail: HoldingDetail; titleId?: string }) {
  const { montantsMasques } = usePreferencesAffichage()
  const gainPositif = (detail.rendement_depuis_achat_pct ?? 0) >= 0

  return (
    <div className="space-y-6">
      <div className="flex items-baseline gap-3">
        <h2 id={titleId} className="text-xl font-semibold text-texte">
          {detail.nom ?? detail.ticker}
        </h2>
        <span className="text-sm text-texte-attenue">{detail.ticker}</span>
        {detail.type_actif && (
          <span className="rounded-full bg-surface-elevee px-2 py-0.5 text-xs font-medium text-texte-attenue">
            {CATEGORY_LABELS[detail.type_actif] ?? detail.type_actif}
          </span>
        )}
      </div>

      <Card>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-texte-attenue">Quantité</p>
            <p className="mt-1 text-lg font-semibold text-texte">{formatQuantite(detail.quantite)}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-texte-attenue">Prix de revient</p>
            <p className="mt-1 text-lg font-semibold text-texte">{formatEuro(detail.prix_revient_moyen, 2, montantsMasques)}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-texte-attenue">Prix actuel</p>
            <p className="mt-1 text-lg font-semibold text-texte">{formatEuro(detail.prix_actuel, 2, montantsMasques)}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-texte-attenue">Valeur</p>
            <p className="mt-1 text-lg font-semibold text-texte">{formatEuro(detail.valeur, 2, montantsMasques)}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-texte-attenue">Depuis achat</p>
            <p className={`mt-1 text-lg font-semibold ${gainPositif ? 'text-positif' : 'text-negatif'}`}>
              {formatPct(detail.rendement_depuis_achat_pct)}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-texte-attenue">Rendement annualisé</p>
            <p className="mt-1 text-lg font-semibold text-texte">{formatPct(detail.rendement_annualise_pct)}</p>
            {detail.rendement_annualise_pct === null && (
              <p className="text-xs text-texte-attenue">
                indisponible : moins de 90 jours de détention, ou pas d'historique exploitable
              </p>
            )}
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-texte-attenue">Secteur</p>
            <p className="mt-1 text-sm text-texte">{detail.secteur ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-texte-attenue">Pays</p>
            <p className="mt-1 text-sm text-texte">{detail.pays ?? '—'}</p>
          </div>
        </div>
      </Card>

      {detail.type_actif === 'REAL_ESTATE' ? (
        <ImmobilierSection ticker={detail.ticker} immobilierInitial={detail.immobilier} />
      ) : (
        <HoldingPriceHistoryChart ticker={detail.ticker} />
      )}

      <DetenteursSection ticker={detail.ticker} quotitesInitiales={detail.quotites} />

      <Card title="Émetteur, résumé & frais">
        <div className="space-y-3 text-sm">
          {detail.emetteur && (
            <p>
              <span className="font-medium text-texte">Émetteur : </span>
              {detail.emetteur}
            </p>
          )}
          {detail.resume && <p className="text-texte">{detail.resume}</p>}
          {!detail.emetteur && !detail.resume && <p className="text-texte-attenue">Informations non disponibles.</p>}
          <div className="flex gap-6 border-t border-bordure pt-3">
            <div>
              <p className="text-xs text-texte-attenue">Frais de gestion annuels</p>
              <p className="font-medium text-texte">
                {detail.frais_gestion_pct !== null ? `${detail.frais_gestion_pct}%` : '—'}
              </p>
            </div>
            <div>
              <p className="text-xs text-texte-attenue">Frais de transaction payés (cumulés)</p>
              <p className="font-medium text-texte">{formatEuro(detail.frais_transaction_payes, 2, montantsMasques)}</p>
            </div>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <PieChartCard title="Répartition géographique" items={detail.repartition_geo} />
        <PieChartCard title="Répartition sectorielle" items={detail.repartition_sector} />
      </div>

      {(detail.repartition_geo_detaillee.length > 0 || detail.repartition_sector_detaillee.length > 0) && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {detail.repartition_geo_detaillee.length > 0 && (
            <Card title="Répartition géographique détaillée">
              <table className="w-full text-sm">
                <tbody className="divide-y divide-bordure">
                  {[...detail.repartition_geo_detaillee]
                    .sort((a, b) => b.poids - a.poids)
                    .map((item) => (
                      <tr key={item.categorie}>
                        <td className="py-2 pr-4 text-texte">{item.categorie}</td>
                        <td className="py-2 text-right font-medium text-texte">{(item.poids * 100).toFixed(2)}%</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </Card>
          )}
          {detail.repartition_sector_detaillee.length > 0 && (
            <Card title="Répartition sectorielle détaillée">
              <table className="w-full text-sm">
                <tbody className="divide-y divide-bordure">
                  {[...detail.repartition_sector_detaillee]
                    .sort((a, b) => b.poids - a.poids)
                    .map((item) => (
                      <tr key={item.categorie}>
                        <td className="py-2 pr-4 text-texte">{item.categorie}</td>
                        <td className="py-2 text-right font-medium text-texte">{(item.poids * 100).toFixed(2)}%</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </Card>
          )}
        </div>
      )}

      {detail.composition_actions.length > 0 && (
        <Card title="Composition en actions (10 plus grosses lignes du fonds)">
          <ResponsiveContainer width="100%" height={Math.max(220, detail.composition_actions.length * 36)}>
            <BarChart data={detail.composition_actions} layout="vertical" margin={{ left: 24, right: 24 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={COULEUR_GRILLE} />
              <XAxis
                type="number"
                unit="%"
                tickFormatter={(v) => (v * 100).toFixed(0)}
                domain={[0, 'dataMax']}
                stroke={COULEUR_AXE}
                tick={STYLE_TICK_AXE}
              />
              <YAxis
                type="category"
                dataKey="symbol"
                width={120}
                tickFormatter={(v: string) => (v.length > 16 ? `${v.slice(0, 15)}…` : v)}
                tick={{ fontSize: 11, ...STYLE_TICK_AXE }}
                stroke={COULEUR_AXE}
              />
              <Tooltip
                formatter={(value) => `${(Number(value) * 100).toFixed(2)}%`}
                labelFormatter={(_, p) => p?.[0]?.payload?.nom ?? ''}
                {...STYLE_INFOBULLE}
              />
              <Bar dataKey="poids" fill="#2563eb" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-bordure text-left text-xs font-medium uppercase text-texte-attenue">
                  <th className="py-2 pr-4">Action</th>
                  <th className="py-2 pr-4">Proportion</th>
                  <th className="py-2 pr-4">Pays</th>
                  <th className="py-2 pr-4">Secteur</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-bordure">
                {detail.composition_actions.map((a) => (
                  <tr key={a.symbol}>
                    <td className="py-2 pr-4">
                      <span className="font-medium text-texte">{a.nom ?? a.symbol}</span>
                      {/* Positions justETF (2.6) : pas de ticker Yahoo distinct, `symbol` porte
                        déjà le nom de l'entreprise — sous-titre redondant, donc masqué. */}
                      {a.symbol !== a.nom && <span className="ml-1 text-xs text-texte-attenue">{a.symbol}</span>}
                    </td>
                    <td className="py-2 pr-4 text-texte">{(a.poids * 100).toFixed(2)}%</td>
                    <td className="py-2 pr-4 text-texte-attenue">{a.pays ?? '—'}</td>
                    <td className="py-2 pr-4 text-texte-attenue">{a.secteur ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}
