import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { HoldingDetail } from '../api/types'
import Card from './Card'
import { DeltaBadge, SegmentedControl } from './Controls'
import { GlassPanel } from './GlassPanel'
import DetenteursSection from './DetenteursSection'
import EpargneApercu from './EpargneApercu'
import EtatVide from './EtatVide'
import HoldingPriceHistoryChart from './HoldingPriceHistoryChart'
import ImmobilierApercu from './ImmobilierApercu'
import ImmobilierParametresForm from './ImmobilierParametresForm'
import PieChartCard from './PieChartCard'
import { usePreferencesAffichage } from '../hooks/usePreferencesAffichage'
import { useImmobilierDetail } from '../hooks/useImmobilierDetail'
import { TYPE_ACTIF_OPTIONS, TYPES_EPARGNE } from '../utils/holdingCategories'
import { formatEuro, formatPct, formatQuantite } from '../utils/format'
import {
  AXE_CATEGORIES,
  CURSEUR_BARRE,
  EPAISSEUR_BARRE,
  RAYON_BARRE_HORIZONTALE,
  STYLE_INFOBULLE,
  hauteurBarres,
} from '../utils/chartTheme'

function libelleTypeActif(typeActif: string | null): string | null {
  if (!typeActif) return null
  return TYPE_ACTIF_OPTIONS.find((o) => o.value === typeActif)?.label ?? typeActif
}

type Onglet = 'apercu' | 'analyse' | 'parametres'

const ONGLETS: { key: Onglet; label: string }[] = [
  { key: 'apercu', label: 'Aperçu' },
  { key: 'analyse', label: 'Analyse' },
  { key: 'parametres', label: 'Paramètres' },
]

/** Fiche d'actif unifiée (backlog 2.M.4) : toute ligne du patrimoine — quelle que
 * soit sa nature (boursière, immobilière, épargne, véhicule...) — ouvre la même
 * structure à trois onglets. *Aperçu* : valeur, courbe/indicateurs propres à la
 * nature de l'actif, informations émetteur. *Analyse* : exposition géo/sectorielle,
 * détention et part nette. *Paramètres* : édition sectionnée (aujourd'hui, les
 * caractéristiques immobilières — seul formulaire de réglages existant ; les autres
 * natures affichent un état vide explicite plutôt qu'un onglet qui semblerait cassé).
 *
 * Les sections propres à chaque nature d'actif (immobilier, épargne, détenteurs...)
 * vivent dans leurs propres composants sous `components/` — cf. backlog audit
 * maintenabilité (même raison que le découpage de `ReglagesPage.tsx`). */
export default function HoldingDetailContent({ detail, titleId }: { detail: HoldingDetail; titleId?: string }) {
  const { montantsMasques } = usePreferencesAffichage()
  const gainPositif = (detail.rendement_depuis_achat_pct ?? 0) >= 0
  const estImmobilier = detail.type_actif === 'REAL_ESTATE'
  const estEpargne = detail.type_actif !== null && TYPES_EPARGNE.has(detail.type_actif)
  const immo = useImmobilierDetail(detail.ticker, estImmobilier || estEpargne, detail.immobilier)
  const [onglet, setOnglet] = useState<Onglet>('apercu')
  const plusValueLatente =
    detail.prix_revient_moyen !== null && detail.prix_revient_moyen !== undefined
      ? detail.valeur - detail.prix_revient_moyen * detail.quantite
      : null

  return (
    <div className="space-y-6">
      {/* Bloc héros de la fiche (refonte, étape 4) : le nom, ses deux badges, puis LA
          valeur — la même hiérarchie que la Synthèse, un seul chiffre qui porte le
          regard. Les quatre chiffres secondaires (quantité, prix de revient, cours,
          annualisé) restent dans le panneau juste en dessous. */}
      <GlassPanel niveau="hero" className="px-6 py-5">
        <div className="flex flex-wrap items-baseline gap-3">
          <h2 id={titleId} className="text-2xl font-semibold tracking-title text-ink">
            {detail.nom ?? detail.ticker}
          </h2>
          <span className="text-sm text-ink3">{detail.ticker}</span>
          {detail.type_actif && (
            <span className="rounded-chip bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent">
              {libelleTypeActif(detail.type_actif)}
            </span>
          )}
          {detail.compte && (
            <Link
              to={`/comptes/${detail.compte.id}`}
              className="rounded-chip bg-track px-2 py-0.5 text-xs font-medium text-ink2 hover:text-ink hover:underline"
            >
              {detail.compte.nom}
            </Link>
          )}
        </div>

        <p className="mt-3 text-[40px] font-semibold leading-none tracking-hero text-ink">
          {formatEuro(detail.valeur, 2, montantsMasques)}
        </p>
        {detail.rendement_depuis_achat_pct !== null && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <DeltaBadge
              valeur={`${gainPositif ? '↑' : '↓'} ${Math.abs(detail.rendement_depuis_achat_pct).toFixed(1)} %`}
              positif={gainPositif}
            />
            {plusValueLatente !== null && (
              <span className={`text-[13px] ${gainPositif ? 'text-pos' : 'text-neg'}`}>
                {gainPositif ? '+' : ''}
                {formatEuro(plusValueLatente, 0, montantsMasques)} depuis l'achat
              </span>
            )}
          </div>
        )}
      </GlassPanel>

      <SegmentedControl
        options={ONGLETS.map((o) => ({ valeur: o.key, libelle: o.label }))}
        valeur={onglet}
        onChange={setOnglet}
        ariaLabel="Sections de la fiche"
        semantique="onglets"
        idOnglet={(cle) => `fiche-onglet-${cle}`}
        idPanneau={(cle) => `fiche-panneau-${cle}`}
        className="w-fit"
      />

      {onglet === 'apercu' && (
        <div id="fiche-panneau-apercu" role="tabpanel" aria-labelledby="fiche-onglet-apercu" className="space-y-6">
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

          {estImmobilier ? (
            <ImmobilierApercu
              ticker={detail.ticker}
              immobilier={immo.immobilier}
              historique={immo.historique}
              onHistoriqueChanged={() => immo.rechargerHistorique()}
              dateAcquisition={detail.date_acquisition}
              prixRevientMoyen={detail.prix_revient_moyen}
            />
          ) : estEpargne ? (
            <EpargneApercu detail={detail} historique={immo.historique} onValorisationAjoutee={immo.rechargerHistorique} />
          ) : (
            <HoldingPriceHistoryChart ticker={detail.ticker} />
          )}

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
        </div>
      )}

      {onglet === 'analyse' && (
        <div id="fiche-panneau-analyse" role="tabpanel" aria-labelledby="fiche-onglet-analyse" className="space-y-6">
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
              <ResponsiveContainer width="100%" height={hauteurBarres(detail.composition_actions.length)}>
                <BarChart
                  data={detail.composition_actions}
                  layout="vertical"
                  margin={{ left: 0, right: 8 }}
                  barSize={EPAISSEUR_BARRE}
                >
                  <XAxis type="number" domain={[0, 'dataMax']} hide />
                  <YAxis
                    dataKey="symbol"
                    width={120}
                    tickFormatter={(v: string) => (v.length > 16 ? `${v.slice(0, 15)}…` : v)}
                    {...AXE_CATEGORIES}
                  />
                  <Tooltip
                    formatter={(value) => `${(Number(value) * 100).toFixed(2)}%`}
                    labelFormatter={(_, p) => p?.[0]?.payload?.nom ?? ''}
                    cursor={CURSEUR_BARRE}
                    {...STYLE_INFOBULLE}
                  />
                  <Bar dataKey="poids" fill="var(--s1)" radius={RAYON_BARRE_HORIZONTALE} isAnimationActive={false} />
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

          <DetenteursSection ticker={detail.ticker} quotitesInitiales={detail.quotites} compte={detail.compte} />
        </div>
      )}

      {onglet === 'parametres' && (
        <div id="fiche-panneau-parametres" role="tabpanel" aria-labelledby="fiche-onglet-parametres" className="space-y-6">
          {estImmobilier ? (
            <ImmobilierParametresForm
              form={immo.form}
              setForm={immo.setForm}
              saving={immo.saving}
              error={immo.error}
              onSave={immo.handleSave}
            />
          ) : (
            <Card>
              <EtatVide titre="Aucun paramètre modifiable pour cette ligne pour l'instant." />
            </Card>
          )}
        </div>
      )}
    </div>
  )
}
