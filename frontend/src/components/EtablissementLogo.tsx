import { useEffect, useState } from 'react'
import { IconEtablissement } from './icons'
import { trouverEtablissementConnu } from '../utils/etablissementsConnus'
import { chargerLogos, logoDe, sAbonner } from '../utils/logosEtablissements'

const TAILLES = { sm: 'h-5 w-5 text-[10px]', md: 'h-7 w-7 text-xs', lg: 'h-12 w-12 text-base' } as const

/** Vrai logo de l'établissement s'il en a un, sinon repli. Le logo réel est chargé
 * une seule fois par page pour tous les badges (`utils/logosEtablissements.ts`) —
 * `etablissementId` absent (aperçu du catalogue, avant toute création), on ne
 * cherche même pas. */
function useLogoReel(etablissementId: number | null | undefined): string | undefined {
  const [logo, setLogo] = useState(() => logoDe(etablissementId))

  useEffect(() => {
    if (etablissementId === null || etablissementId === undefined) return
    const desabonner = sAbonner(() => setLogo(logoDe(etablissementId)))
    void chargerLogos().then(() => setLogo(logoDe(etablissementId)))
    return desabonner
  }, [etablissementId])

  return logo
}

/** Badge d'établissement (refonte import, 05/09/2026). Trois niveaux, dans l'ordre :
 * le logo réel (téléversé, récupéré depuis le site officiel ou depuis une URL),
 * à défaut les initiales colorées d'un établissement connu du catalogue
 * (`utils/etablissementsConnus.ts`), à défaut un badge neutre. Un établissement
 * dont le logo n'a pas pu être récupéré n'affiche donc jamais un trou. */
export default function EtablissementLogo({
  etablissementId,
  logoKey,
  nom,
  taille = 'sm',
  className,
}: {
  etablissementId?: number | null
  logoKey?: string | null
  nom: string
  taille?: keyof typeof TAILLES
  className?: string
}) {
  const logoReel = useLogoReel(etablissementId)
  const connu = trouverEtablissementConnu(logoKey)
  const base = `inline-flex shrink-0 items-center justify-center rounded-chip font-semibold ${TAILLES[taille]} ${className ?? ''}`

  if (logoReel) {
    return (
      <span className={`${base} overflow-hidden bg-surface`} title={nom}>
        <img src={logoReel} alt="" className="h-full w-full object-contain" />
      </span>
    )
  }

  if (connu) {
    return (
      <span className={base} style={{ backgroundColor: connu.couleur, color: '#fff' }} aria-hidden title={nom}>
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
