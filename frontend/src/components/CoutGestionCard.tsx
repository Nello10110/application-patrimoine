import type { CoutGestionConsolide } from '../api/types'
import Card from './Card'
import { usePreferencesAffichage } from '../hooks/usePreferencesAffichage'
import { formatEuro } from '../utils/format'

/** Coût de gestion annuel consolidé des fonds/ETF détenus (roadmap Phase 3, § E.3) —
 * somme des TER pondérés par la valeur de chaque ligne. N'affiche rien tant qu'aucun
 * fonds n'est détenu (`valeur_fonds === 0`). */
export default function CoutGestionCard({ cout }: { cout: CoutGestionConsolide }) {
  const { montantsMasques } = usePreferencesAffichage()
  if (cout.valeur_fonds === 0) return null

  return (
    <Card title="Coût de gestion annuel estimé (fonds/ETF)">
      <p className="text-3xl font-semibold text-texte">{formatEuro(cout.cout_annuel_estime, 2, montantsMasques)}</p>
      <p className="mt-1 text-sm text-texte-attenue">
        sur {formatEuro(cout.valeur_fonds, 0, montantsMasques)} de fonds/ETF détenus, dont {cout.couverture_pct}% avec des frais de gestion connus.
      </p>
      {cout.couverture_pct < 100 && (
        <p className="mt-3 text-xs text-texte-attenue">
          Les {formatEuro(cout.valeur_fonds - cout.valeur_fonds_avec_ter_connu, 0, montantsMasques)} restants n'ont pas encore de frais de gestion
          connus (récupérés une seule fois par fonds, au fil des rafraîchissements) — le coût réel est donc sous-estimé tant que la
          couverture n'atteint pas 100%.
        </p>
      )}
    </Card>
  )
}
