// États de chargement uniformes (backlog 2.K.1), remplace les `<p>Chargement...</p>`
// répétés à l'identique dans une quinzaine de fichiers. Hors périmètre volontaire :
// le `Suspense fallback` de `App.tsx` et l'écran de connexion/chargement initial
// (avant que `PreferencesAffichageProvider`/le layout ne soient montés) restent du
// texte simple, ces jetons n'y étant pas encore disponibles à ce stade du rendu.

export function Skeleton({ className = '', style }: { className?: string; style?: React.CSSProperties }) {
  return <div aria-hidden="true" style={style} className={`animate-pulse rounded-md bg-surface-elevee ${className}`} />
}

/** Bloc de texte en cours de chargement (remplace `<p>Chargement...</p>`). */
export function SkeletonTexte({ lignes = 3 }: { lignes?: number }) {
  return (
    <div className="space-y-2" role="status" aria-label="Chargement en cours">
      {Array.from({ length: lignes }).map((_, i) => (
        <Skeleton key={i} className={`h-4 ${i === lignes - 1 ? 'w-2/3' : 'w-full'}`} />
      ))}
    </div>
  )
}

/** Emplacement d'un graphique en cours de chargement — hauteur fixe égale à celle
 * du graphique final pour éviter un saut de mise en page à l'arrivée des données. */
export function SkeletonGraphique({ hauteur = 280 }: { hauteur?: number }) {
  return <Skeleton className="w-full" style={{ height: hauteur }} />
}
