import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import type { Compte, HoldingDetail } from '../api/types'
import Card from './Card'
import EtatErreur from './EtatErreur'
import { SkeletonTexte } from './Skeleton'
import { useEditeurQuotites } from '../hooks/useEditeurQuotites'
import { usePreferencesAffichage } from '../hooks/usePreferencesAffichage'
import { formatEuro } from '../utils/format'

/** Répartition entre détenteurs (backlog 2.L.1) — n'apparaît que si l'utilisateur a
 * déclaré au moins un détenteur (Réglages). Gère son propre état, indépendant du
 * `detail` du composant parent : après enregistrement, recharge la fiche pour
 * obtenir la part détenue/nette à jour sans faire remonter l'état au parent.
 * `compte` (backlog X.4) : purement informatif, un simple renvoi vers la fiche du
 * compte quand cette ligne en a un — la répartition qui s'y fait s'applique à TOUTES
 * les lignes du compte en une fois, alternative à cette saisie ligne par ligne. */
export default function DetenteursSection({
  ticker,
  quotitesInitiales,
  compte,
}: {
  ticker: string
  quotitesInitiales: HoldingDetail['quotites']
  compte?: Compte | null
}) {
  const { montantsMasques } = usePreferencesAffichage()
  const [quotitesEnregistrees, setQuotitesEnregistrees] = useState(quotitesInitiales)
  const { detenteurs, erreurChargement, rechargerDetenteurs, saisie, setValeur, total, totalValide, saving, error, handleSave } =
    useEditeurQuotites({
      enregistrer: (quotites) => api.setHoldingQuotites(ticker, quotites),
      valeursInitiales: quotitesInitiales,
      // Seul des trois éditeurs à recharger : l'endpoint de la fiche renvoie les
      // parts détenue/nette recalculées, que ce bloc affiche.
      apresEnregistrement: async () => {
        const detailFrais = await api.getHoldingDetail(ticker)
        setQuotitesEnregistrees(detailFrais.quotites)
      },
    })

  if (erreurChargement !== null) {
    return (
      <Card title="Détenteurs">
        <EtatErreur message={`Impossible de charger les détenteurs : ${erreurChargement}`} onReessayer={rechargerDetenteurs} />
      </Card>
    )
  }
  if (detenteurs === null) return <SkeletonTexte lignes={2} />
  if (detenteurs.length === 0) return null

  return (
    <Card title="Détenteurs">
      <p className="mb-4 text-sm text-texte">
        Répartition de cette ligne entre les personnes/sociétés déclarées dans Réglages — la somme doit faire 100 % (ou
        rester à 0 % pour ne pas répartir, 100 % foyer implicite).
        {compte && (
          <>
            {' '}
            Cette ligne appartient au compte{' '}
            <Link to={`/comptes/${compte.id}`} className="font-medium text-accent hover:underline">
              {compte.nom}
            </Link>{' '}
            — définis-la plutôt une seule fois pour tout le compte depuis sa fiche, si les autres lignes du compte
            doivent avoir la même répartition.
          </>
        )}
      </p>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-bordure text-left text-xs font-medium uppercase text-texte-attenue">
            <th className="py-2 pr-4">Détenteur</th>
            <th className="py-2 pr-4">Quotité</th>
            {/* « Part détenue » / « Part nette » : deux notions proches et
                systématiquement confondues sans explication (recette du
                02/09/2026) — elles ne diffèrent QUE si un emprunt est rattaché. */}
            <th className="py-2 pr-4 text-right" title="Valeur de l'actif revenant à ce détenteur, au prorata de sa quotité, SANS déduire l'emprunt.">
              Part détenue
            </th>
            <th
              className="py-2 pr-4 text-right"
              title="Part détenue MOINS la part du capital restant dû de l'emprunt rattaché. Identique à la part détenue si aucun emprunt n'est rattaché à cette ligne."
            >
              Part nette
            </th>
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
                    onChange={(e) => setValeur(d.id, e.target.value)}
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
