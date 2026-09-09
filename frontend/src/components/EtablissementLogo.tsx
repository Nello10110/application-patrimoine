import { useEffect, useState } from 'react'
import { IconEtablissement } from './icons'
import { trouverEtablissementConnu } from '../utils/etablissementsConnus'
import { chargerLogos, logoDe, sAbonner } from '../utils/logosEtablissements'
import { chargerLogosCatalogue, logoCatalogueDe, sAbonnerCatalogue } from '../utils/logosCatalogue'

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

/** Logo réel du CATALOGUE (retour utilisateur du 09/09/2026) — même mécanique que
 * `useLogoReel` ci-dessus, mais indexée par `logo_key` plutôt que par un id
 * d'établissement : sert le sélecteur (`CatalogueEtablissementPicker`), affiché
 * AVANT toute création. Cherché même si `etablissementId` est déjà connu (un
 * établissement créé depuis le catalogue mais jamais rafraîchi via « Récupérer le
 * logo officiel » n'a pas encore de logo réel à lui — celui du catalogue reste un
 * meilleur repli que les initiales tant qu'il n'a pas le sien). */
function useLogoCatalogue(logoKey: string | null | undefined): string | undefined {
  const [logo, setLogo] = useState(() => logoCatalogueDe(logoKey))

  useEffect(() => {
    if (!logoKey) return
    const desabonner = sAbonnerCatalogue(() => setLogo(logoCatalogueDe(logoKey)))
    void chargerLogosCatalogue().then(() => setLogo(logoCatalogueDe(logoKey)))
    return desabonner
  }, [logoKey])

  return logo
}

/** Badge d'établissement (refonte import, 05/09/2026). Quatre niveaux, dans l'ordre :
 * le logo réel POSÉ sur l'établissement (téléversé, récupéré depuis le site
 * officiel ou depuis une URL), à défaut le logo réel du CATALOGUE pour cette même
 * clé (retour utilisateur du 09/09/2026 — utile dans le sélecteur, avant toute
 * création), à défaut les initiales colorées d'un établissement connu du catalogue
 * (`utils/etablissementsConnus.ts`), à défaut un badge neutre. Un établissement
 * dont aucun logo n'a pu être récupéré n'affiche donc jamais un trou. */
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
  // Deux hooks TOUJOURS appelés (règle des Hooks) : `??` ne doit combiner que leurs
  // RÉSULTATS, jamais décider lequel appeler — un appel conditionnel romprait
  // l'ordre des Hooks d'un rendu à l'autre selon que le premier renvoie déjà un logo.
  const logoReelPropre = useLogoReel(etablissementId)
  const logoReelCatalogue = useLogoCatalogue(logoKey)
  const logoReel = logoReelPropre ?? logoReelCatalogue
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
