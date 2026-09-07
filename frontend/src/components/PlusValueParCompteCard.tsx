import { Bar, BarChart, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { Holding } from '../api/types'
import Card from './Card'
import EtatVide from './EtatVide'
import {
  AXE_CATEGORIES,
  COULEUR_NEGATIF,
  COULEUR_POSITIF,
  CURSEUR_BARRE,
  EPAISSEUR_BARRE,
  STYLE_INFOBULLE,
  hauteurBarres,
} from '../utils/chartTheme'
import { formatEuro, formatPct } from '../utils/format'
import { calculerGainsParCompte } from '../utils/gainsParCompte'

/** Plus-value par compte (retour utilisateur, 05/09/2026) : « voir où j'ai de la
 * plus-value, où j'en ai moins », au même titre que le Gain/Perte de la Synthèse
 * (`PerformanceCard.tsx`) mais éclaté par compte plutôt qu'un seul total foyer. Un
 * seul graphique plutôt qu'un par compte (choix délibéré, demande explicite de
 * l'utilisateur de ne pas surcharger l'écran) — la comparaison entre comptes tient
 * dans une seule vue à barres, jamais plusieurs petits multiples.
 *
 * Entièrement calculé côté client depuis `holdings` (déjà chargées par
 * `ComptesPage`, aucun nouvel appel réseau) : `Holding.valeur`/`prix_revient_moyen`/
 * `rendement_annualise_pct` sont déjà calculés côté serveur pour chaque ligne
 * (`performance_service.compute_holding_returns`) — sommer par compte ne demande
 * aucune nouvelle donnée. Une VRAIE plus-value réalisée ou un XIRR par compte, en
 * revanche, sont délibérément hors de portée : le grand livre de transactions ne
 * conserve aucune trace du compte d'origine (seul le compte ACTUEL de chaque ligne
 * est connu), un calcul flux par flux par compte serait donc fictif — cf.
 * `docs/BACKLOG.md`. */
export default function PlusValueParCompteCard({ holdings, montantsMasques }: { holdings: Holding[]; montantsMasques: boolean }) {
  const lignes = calculerGainsParCompte(holdings)

  if (lignes.length === 0) {
    return (
      <Card title="Plus-value par compte">
        <EtatVide
          titre="Rien à comparer pour l'instant."
          description="Ce comparatif porte sur les lignes avec un prix de revient connu (actions, fonds, immobilier...) — un compte courant ou un livret n'en a pas."
        />
      </Card>
    )
  }

  const data = lignes.map((l) => ({ nom: l.compteNom, gain: l.gain }))

  return (
    <Card title="Plus-value par compte">
      <p className="mb-4 text-sm text-texte-attenue">
        Plus-value latente (valeur actuelle moins prix de revient) par compte — permet de repérer d'un coup d'œil les
        comptes qui tirent le patrimoine vers le haut ou vers le bas.
      </p>

      {/* Barres de part et d'autre d'un filet central (maquette de l'écran Analyse) :
          l'axe des valeurs disparaît, seul le zéro reste — c'est lui qui donne son
          sens au signe. `--pos`/`--neg` directement, et non `var(--color-positif)` :
          ce dernier est le nom généré par Tailwind pour le même jeton, et deux
          chemins d'indirection pour une seule couleur finissent par diverger. */}
      <ResponsiveContainer width="100%" height={hauteurBarres(data.length)}>
        <BarChart data={data} layout="vertical" margin={{ left: 0, right: 8 }} barSize={EPAISSEUR_BARRE}>
          <XAxis type="number" hide />
          <YAxis dataKey="nom" width={140} {...AXE_CATEGORIES} />
          <ReferenceLine x={0} stroke="var(--hairline)" />
          <Tooltip
            formatter={(value) => formatEuro(Number(value), 0, montantsMasques)}
            cursor={CURSEUR_BARRE}
            {...STYLE_INFOBULLE}
          />
          <Bar dataKey="gain" radius={[12, 12, 12, 12]} isAnimationActive={false}>
            {data.map((entree) => (
              <Cell key={entree.nom} fill={entree.gain >= 0 ? COULEUR_POSITIF : COULEUR_NEGATIF} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      <div className="mt-2 flex items-center gap-4 text-xs text-texte-attenue">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-positif" /> Plus-value
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-negatif" /> Moins-value
        </span>
      </div>

      <div className="mt-4 overflow-x-auto border-t border-bordure pt-4">
        <table className="w-full min-w-[480px] text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-texte-attenue">
              <th className="pb-2 font-medium">Compte</th>
              <th className="pb-2 font-medium">Valeur</th>
              <th className="pb-2 font-medium">Plus-value</th>
              <th className="pb-2 font-medium">
                <span
                  className="cursor-help underline decoration-dotted"
                  title="Moyenne des rendements annualisés (XIRR) de chaque ligne du compte, pondérée par leur valeur actuelle — indicatif, pas un calcul flux par flux au niveau du compte : le grand livre de transactions ne conserve pas le compte d'origine de chaque mouvement."
                >
                  Rendement annualisé
                </span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-bordure">
            {lignes.map((l) => {
              const couleur = l.gain >= 0 ? 'text-positif' : 'text-negatif'
              return (
                <tr key={l.compteId}>
                  <td className="py-2 text-texte">{l.compteNom}</td>
                  <td className="py-2 text-texte">{formatEuro(l.valeur, 0, montantsMasques)}</td>
                  <td className={`py-2 font-medium ${couleur}`}>
                    {l.gain >= 0 ? '+' : ''}
                    {formatEuro(l.gain, 0, montantsMasques)}
                    {l.gainPct !== null && <span className="ml-1.5 font-normal">({formatPct(l.gainPct)})</span>}
                  </td>
                  <td className="py-2 text-texte">{formatPct(l.rendementAnnualise)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
