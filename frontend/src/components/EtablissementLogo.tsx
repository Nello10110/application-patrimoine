import { IconEtablissement } from './icons'
import { trouverEtablissementConnu } from '../utils/etablissementsConnus'

const TAILLES = { sm: 'h-5 w-5 text-[10px]', md: 'h-7 w-7 text-xs' } as const

/** Badge d'établissement (refonte import, 05/09/2026) : initiales colorées pour un
 * établissement connu du catalogue (`logoKey` renseigné), badge neutre sinon
 * (personnalisé, ou clé absente du catalogue) — jamais un logo de marque réel, cf.
 * `utils/etablissementsConnus.ts`. */
export default function EtablissementLogo({
  logoKey,
  nom,
  taille = 'sm',
  className,
}: {
  logoKey?: string | null
  nom: string
  taille?: keyof typeof TAILLES
  className?: string
}) {
  const connu = trouverEtablissementConnu(logoKey)
  const base = `inline-flex shrink-0 items-center justify-center rounded-full font-semibold ${TAILLES[taille]} ${className ?? ''}`

  if (connu) {
    return (
      <span
        className={base}
        style={{ backgroundColor: connu.couleur, color: '#fff' }}
        aria-hidden
        title={nom}
      >
        {connu.initiales}
      </span>
    )
  }

  return (
    <span className={`${base} bg-surface-elevee text-texte-attenue`} aria-hidden title={nom}>
      <IconEtablissement className="h-[65%] w-[65%]" />
    </span>
  )
}
