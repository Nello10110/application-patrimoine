import { useEffect, useState } from 'react'
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { api } from '../api/client'
import type { DividendeMois } from '../api/types'
import Card from './Card'
import EtatErreur from './EtatErreur'
import EtatVide from './EtatVide'
import { GlassPanel } from './GlassPanel'
import RevenusPassifsCard from './RevenusPassifsCard'
import { SkeletonTexte } from './Skeleton'
import { usePreferencesAffichage } from '../hooks/usePreferencesAffichage'
import {
  AXE_CATEGORIES,
  CURSEUR_BARRE,
  EPAISSEUR_BARRE,
  RAYON_BARRE_HORIZONTALE,
  STYLE_INFOBULLE,
  hauteurBarres,
} from '../utils/chartTheme'
import { formatDate, formatEuro } from '../utils/format'

function libelleMois(mois: string): string {
  const [annee, m] = mois.split('-')
  const date = new Date(Number(annee), Number(m) - 1, 1)
  const libelle = date.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
  return libelle.charAt(0).toUpperCase() + libelle.slice(1)
}

function MoisCard({ mois }: { mois: DividendeMois }) {
  const { montantsMasques } = usePreferencesAffichage()
  const [ouvert, setOuvert] = useState(false)

  return (
    <div className="rounded-card border border-bordure">
      <button
        type="button"
        onClick={() => setOuvert((v) => !v)}
        aria-expanded={ouvert}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
      >
        <span className="text-sm font-medium text-texte">{libelleMois(mois.mois)}</span>
        <span className="flex items-center gap-3">
          <span className="text-sm font-semibold text-positif">{formatEuro(mois.montant_total, 2, montantsMasques)}</span>
          <span className="text-texte-attenue" aria-hidden="true">
            {ouvert ? '▲' : '▼'}
          </span>
        </span>
      </button>
      {ouvert && (
        <table className="w-full border-t border-bordure text-sm">
          <tbody>
            {mois.lignes.map((ligne, i) => (
              <tr key={i} className="border-b border-bordure last:border-0">
                <td className="px-4 py-2 text-texte-attenue">{formatDate(ligne.date)}</td>
                <td className="px-4 py-2 text-texte">{ligne.nom ?? ligne.symbol ?? '—'}</td>
                <td className="px-4 py-2 text-right font-medium text-texte">{formatEuro(ligne.montant, 2, montantsMasques)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

/** Onglet « Revenus » de l'écran Analyse (réorganisation du 07/09/2026) — ce qui
 * TOMBE du patrimoine sans le vendre : dividendes encaissés (ex-écran Dividendes,
 * déplacé ici tel quel) et revenus passifs (loyers, intérêts d'épargne, ex-détail du
 * tableau de bord).
 *
 * Les deux vivaient dans deux écrans différents alors qu'ils répondent à la même
 * question — « combien mon patrimoine me rapporte-t-il ? » — et qu'aucun des deux ne
 * suffisait seul à y répondre. */
export default function RevenusSection() {
  const { montantsMasques } = usePreferencesAffichage()
  const [calendrier, setCalendrier] = useState<DividendeMois[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  function charger() {
    setError(null)
    api
      .getDividendCalendar()
      .then(setCalendrier)
      .catch((err) => setError(err.message))
  }

  useEffect(charger, [])

  if (error) return <EtatErreur message={error} onReessayer={charger} />
  if (!calendrier) return <SkeletonTexte />

  const total = calendrier.reduce((acc, m) => acc + m.montant_total, 0)
  const donneesGraphique = calendrier.map((m) => ({ mois: libelleMois(m.mois), montant: m.montant_total }))

  return (
    <div className="space-y-[14px]">
      {calendrier.length === 0 ? (
        <Card title="Dividendes">
          <EtatVide titre="Aucun dividende perçu pour l'instant sur les transactions importées." />
        </Card>
      ) : (
        <>
          {/* Chiffre héros de l'onglet (un seul par écran, règle de la refonte) : le
              total perçu, en encre — c'est un cumul, pas un gain à comparer à une
              référence, et le vert le faisait lire comme une variation. */}
          <GlassPanel niveau="hero" className="px-6 py-5">
            <p className="text-[13px] font-medium text-ink3">Dividendes perçus</p>
            <p className="text-[48px] font-semibold leading-none tracking-hero text-ink">
              {formatEuro(total, 2, montantsMasques)}
            </p>
            <p className="mt-1.5 text-[13px] text-ink3">
              sur {calendrier.length} mois, du {libelleMois(calendrier[0].mois)} au {libelleMois(calendrier[calendrier.length - 1].mois)}
            </p>
          </GlassPanel>

          <Card title="Par mois">
            <ResponsiveContainer width="100%" height={hauteurBarres(donneesGraphique.length)}>
              <BarChart data={donneesGraphique} layout="vertical" margin={{ left: 0, right: 8 }} barSize={EPAISSEUR_BARRE}>
                <XAxis type="number" hide />
                <YAxis dataKey="mois" width={130} {...AXE_CATEGORIES} />
                <Tooltip
                  formatter={(value) => formatEuro(Number(value), 2, montantsMasques)}
                  cursor={CURSEUR_BARRE}
                  {...STYLE_INFOBULLE}
                />
                <Bar dataKey="montant" fill="var(--s1)" radius={RAYON_BARRE_HORIZONTALE} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </Card>

          <Card title="Détail des dividendes">
            <div className="space-y-2">
              {[...calendrier].reverse().map((mois) => (
                <MoisCard key={mois.mois} mois={mois} />
              ))}
            </div>
          </Card>
        </>
      )}

      {/* Indépendant de l'historique de transactions (backlog 2.P.3) : un foyer sans
          aucun achat boursier peut quand même avoir des loyers ou une épargne à taux
          — jamais gardé derrière la présence de dividendes. */}
      <RevenusPassifsCard />
    </div>
  )
}
